import { Link } from "react-router";
import { Button, Card } from "../../shared/ui/index.js";
import { AvatarFrame } from "./AvatarFrame.jsx";
import { useMyAvatar } from "./hooks.js";

export function MyAvatarCard() {
  const query = useMyAvatar();
  return (
    <Card as="section" className="my-avatar-card" aria-labelledby="my-avatar-title">
      <h2 id="my-avatar-title">내 아바타</h2>
      {query.isPending ? <p role="status">아바타를 불러오고 있어요.</p> : null}
      {query.isError ? <><p role="alert">아바타를 불러오지 못했어요.</p><Button variant="secondary" data-ph-capture-attribute-action="avatar_load_retry" onClick={() => query.refetch()}>다시 불러오기</Button></> : null}
      {query.data ? <>
        <AvatarFrame key={JSON.stringify(query.data.appearance)} appearance={query.data.appearance} mode="preview" />
        <Link className="ui-button ui-button--primary" data-ph-capture-attribute-action="my_avatar_edit_open" to="/my/avatar">{query.data.customized ? "아바타 수정하기" : "아바타 만들기"}</Link>
      </> : null}
    </Card>
  );
}
