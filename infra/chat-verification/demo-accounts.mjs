import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const accounts = new Map([["haru", { id: 904001, name: "하루" }], ["moa", { id: 904002, name: "모아" }]]);
const cookieName = "chatDemoCsrf";

function cookieValue(req, name) {
  return (req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function sameToken(left = "", right = "") {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function accessToken(memberId, secret) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const content = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: String(memberId), iat: now, exp: now + 3600 })}`;
  return `${content}.${createHmac("sha256", secret).update(content).digest("base64url")}`;
}

export function createDemoAccounts({ enabled, secret, databaseUrl, port }) {
  if (!enabled) return null;
  if (process.env.NODE_ENV === "production" || !secret || Buffer.byteLength(secret) < 32 ||
      databaseUrl !== "jdbc:postgresql://127.0.0.1:5432/jarihana_chat_realtime") {
    throw new Error("Demo login requires the isolated local chat database and a signing secret");
  }
  const origin = `http://localhost:${port}`;
  return async function handle(req, res) {
    const url = new URL(req.url, origin);
    if (!url.pathname.startsWith("/_preview/")) return false;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "same-origin");
    if (req.headers.host !== `localhost:${port}`) {
      res.writeHead(400).end("Open this page using localhost");
      return true;
    }
    if (req.method === "GET" && url.pathname === "/_preview/chat") {
      const csrf = randomBytes(32).toString("hex");
      res.setHeader("Set-Cookie", `${cookieName}=${csrf}; Path=/_preview; HttpOnly; SameSite=Strict; Max-Age=600`);
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>채팅 테스트 · 자리하나</title>
<style>:root{font-family:system-ui,sans-serif;color:#171a1c;background:#f7faf9}*{box-sizing:border-box}body{margin:0;padding:48px 20px}main{max-width:560px;margin:8vh auto}h1{font-size:32px;letter-spacing:-1px}p,li{line-height:1.8;color:#51585d}.tag{font-size:13px;color:#27655f}form{margin:16px 0}button{width:100%;min-height:60px;padding:16px 20px;border:1px solid #cbded9;border-radius:12px;background:white;text-align:left;font:inherit;cursor:pointer}button:hover{background:#ddf7ef}button:focus-visible,a:focus-visible{outline:3px solid #16786b;outline-offset:4px}strong{display:block;font-size:18px}small{display:block;margin-top:5px;color:#59656b}a{color:#18675d}.note{margin-top:28px;border-top:1px solid #dde5e1;padding-top:20px}</style>
<main><span class="tag">로컬 테스트</span><h1>두 사람의 채팅을 직접 해 보세요</h1><p>GitHub 계정 없이 시작할 수 있어요.<br>두 계정 모두 테스트 모임 3개에 참여해 있어요.</p>
${[...accounts].map(([key, account]) => `<form method="post" action="/_preview/login"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="account" value="${key}"><button data-ph-capture-attribute-action="chat_demo_login"><strong>${account.name}로 시작하기</strong><small>${key === "haru" ? "첫 번째 창에서 선택해 주세요" : "시크릿 창이나 다른 브라우저에서 선택해 주세요"}</small></button></form>`).join("")}
<div class="note"><ol><li>현재 창에서 하루로 시작해요.</li><li>시크릿 창에서 이 주소를 열고 모아를 선택해요.</li><li>같은 모임을 열어 메시지를 주고받아 보세요.</li></ol><p>선택하면 현재 창의 로그인 계정이 바뀌어요.<br>로그인은 1시간 동안 유지되며 여기서 다시 시작할 수 있어요.</p><a href="/home">서비스 화면으로 돌아가기</a></div></main></html>`);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/_preview/login") {
      if (req.headers.origin !== origin || req.headers["content-type"]?.split(";")[0] !== "application/x-www-form-urlencoded") {
        res.writeHead(403).end("Invalid local login request");
        return true;
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 1024) { res.writeHead(413).end(); return true; }
        chunks.push(chunk);
      }
      const form = new URLSearchParams(Buffer.concat(chunks).toString());
      if (!sameToken(form.get("csrf") ?? "", cookieValue(req, cookieName))) {
        res.writeHead(403).end("Open the account page again");
        return true;
      }
      const account = accounts.get(form.get("account"));
      if (!account) { res.writeHead(400).end("Unknown demo account"); return true; }
      res.setHeader("Set-Cookie", [
        `accessToken=${accessToken(account.id, secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
        "refreshToken=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0",
        `XSRF-TOKEN=${randomBytes(24).toString("hex")}; Path=/; SameSite=Lax`,
        `${cookieName}=; Path=/_preview; HttpOnly; SameSite=Strict; Max-Age=0`
      ]);
      res.writeHead(303, { Location: "/home?chat=905001" }).end();
      return true;
    }
    res.writeHead(404).end();
    return true;
  };
}
