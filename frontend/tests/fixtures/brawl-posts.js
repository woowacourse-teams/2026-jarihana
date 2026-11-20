// Test-only conversation records; these are never loaded by the service page.
const names = [
  '도토리', '구름빵', '민들레', '보리차', '달콩', '모닥불', '오솔길', '반달', '초록별', '감자꽃',
  '솔방울', '조약돌', '물결', '두부', '산들', '노을', '귤껍질', '별사탕', '자몽', '포근',
  '해바라기', '바람개비', '복숭아', '새벽', '호두', '솜사탕', '유자', '나무늘보', '파도', '루꼴라',
];
const messages = {
  a: [
    '표정까지 봐야 오해가 덜 생겨요.', '같이 밥 먹으며 얘기하면 금방 친해져요.', '어려운 얘기는 직접 만나서 해요.',
    '온라인에선 끼어들 타이밍이 어렵더라고요.', '화이트보드에 같이 그리면 빨라요.', '저는 눈을 보고 듣는 게 좋아요.',
    '산책하면서 얘기하는 것도 좋죠.', '이모티콘으로는 안 전해지는 게 있어요.', '잠깐의 침묵도 만나면 편하잖아요.',
    '집중이 흐트러질 때 바로 알 수 있어요.', '끝나고 같이 커피 한잔할 수 있고요.', '처음 만나는 사이라면 대면 한 표!',
    '화면 너머로는 분위기를 놓치기도 해요.', '같은 공간에서 웃는 맛이 있죠.', '멀어도 가끔은 만났으면 좋겠어요.',
  ],
  b: [
    '이동 시간이 줄어서 더 자주 얘기해요.', '먼 곳에 살아도 바로 만날 수 있죠.', '집에서 편하게 말하는 게 좋아요.',
    '글로 남아야 다시 찾아보기 쉬워요.', '생각을 정리한 뒤 답할 수 있잖아요.', '퇴근하고 이동까지 하면 지쳐요.',
    '짧은 회의는 온라인이면 충분해요.', '화면 공유하면 같이 보기 편해요.', '저는 채팅으로 더 솔직하게 말해요.',
    '비 오는 날에도 약속을 지킬 수 있죠.', '해외 친구랑도 수다 떨 수 있어요.', '말하기 전에 자료를 찾아볼 수도 있고요.',
    '목소리만 듣고 걸으면서 얘기해요.', '모일 장소를 잡는 수고가 없어요.', '자주 연락하는 쪽이 더 가까워져요.',
  ],
};

export function brawlPosts(mint, coral, repeats = 1, { burst = false } = {}) {
  const posts = [];
  const append = (side, author, repeat, text) => {
    const id = String(posts.length + 1), nameIndex = author + (side === 'a' ? 0 : mint);
    posts.push({ id, authorId: `${side}-${author}`, side,
      name: `가상 ${names[nameIndex % names.length]}${nameIndex >= names.length ? ' ' + (Math.floor(nameIndex / names.length) + 1) : ''}`,
      memberType: author % 3 ? 'CREW' : 'COACH', text: text ?? messages[side][(author + repeat * 4) % messages[side].length],
      createdAt: 1793808000000 + Number(id) * 1000, replyToId: null, replyTo: null });
  };
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const [side, count] of [['a', mint], ['b', coral]]) {
      for (let author = 0; author < count; author++) {
        append(side, author, repeat);
        if (burst && side === 'a' && author === 0) {
          for (const text of ['저 아직 할 말 있어요!', '직접 만나면 오해가 줄어요.', '아, 아까 말에 덧붙이면요.', '한 사람이 이어서 말하는 중이에요.', '이제 다른 분 의견도 들을게요.']) append(side, author, repeat, text);
        }
      }
    }
  }
  return posts;
}
