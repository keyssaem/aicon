# 아이콘(AiCon) 웹앱

인공지능 교육용 보드게임 **아이콘**을 방 코드로 모여 2~4명이 즐기는 웹앱으로 옮기는 작업입니다.
현재는 **P1(방 코드 멀티플레이)** 까지 되어 있습니다. 방 코드로 모인 2~4명이 각자 기기에서 2라운드를 끝까지 할 수 있습니다.

- 설계안(계획 전체): https://claude.ai/artifact/UpsB8oiuZivvWK9p91wGnG
- 확정 규칙: [docs/rules.md](docs/rules.md)
- 배포 안내: [docs/deploy.md](docs/deploy.md)

## 폴더

```
packages/content   카드 데이터와 이미지
  src/cards.public.json     이름·별·설명 (학생 기기에 보내도 되는 것)
  src/answers.server.json   YES/NO 정답과 해설 (서버 전용)
  assets/cards/*.webp       카드 이미지 69장
packages/protocol  기기 ↔ 서버 메시지 타입과 입력 검사(zod)
packages/engine    규칙 엔진 (순수 함수) + 테스트
packages/ui        카드 그림·기록 문구 등 화면 공용 부품
apps/server        게임 서버 (Fastify + Socket.IO): 방·좌석·타이머
apps/web           학생·교사가 쓰는 화면 (React)
apps/hotseat       핫시트 디버거 (개발용, 네트워크 없이 규칙 확인)
docs/              rules.md(규칙) · deploy.md(배포)
```

## 쓰는 법

```bash
npm install          # 처음 한 번
npm test             # 규칙 엔진 + 서버 테스트 (무작위 1,000판 포함)
npm run typecheck    # 타입 검사

# 개발: 두 개를 함께 띄웁니다
npm run dev:server   # 게임 서버 (5175)
npm run dev:web      # 화면 (5174) → http://localhost:5174

# 배포용: 한 주소에서 화면까지 함께 제공
npm run build        # 화면 빌드 + 정답 유출 검사
npm start            # http://localhost:5175

npm run dev:hotseat  # 핫시트 디버거 (네트워크 없이 규칙 확인)
npm run assets:build # 원본 JPG → WebP 다시 만들기 (이미지가 바뀌었을 때만)
node apps/server/scripts/testbot.mjs <방코드> 민수   # 테스트용 상대 붙이기
```

## 핫시트 디버거

- 위쪽 탭으로 **시점**을 바꿉니다. 각 좌석 시점은 그 좌석이 실제로 받게 될 화면(`viewFor`)만 보여 주고,
  `전체(디버그)` 탭은 서버가 가진 상태를 전부 보여 줍니다.
- 손패 카드를 눌러 고르고, 강조된 베이스카드를 누르면 내려놓습니다. 스페셜카드를 누르면 그 카드 사용 모드가 됩니다.
- `랜덤 1수`·`랜덤 40수`로 무작위 진행, `되돌리기`로 한 수 무르기, `정답 보기`로 카드의 YES/NO 확인.
- `기록 복사`를 누르면 `{시드, 행동 목록}`이 클립보드에 담깁니다. 버그를 만나면 이 JSON을 그대로 붙여 두면
  `기록 불러오기`로 같은 장면을 언제든 되살릴 수 있습니다.

## 지켜야 할 원칙

1. **정답은 서버에만.** `@aicon/content/server`와 `@aicon/engine`은 학생 기기로 가는 코드에서 import하지 않습니다.
   학생 기기로 가는 `apps/web`은 `@aicon/content/public`과 `@aicon/protocol`만 씁니다. (핫시트는 개발용이라 예외이며, `npm run build`가 빌드에 정답이 섞였는지 검사합니다.)
2. **카드 ID와 파일명은 순서가 없어야 합니다.** 원본 이미지 번호(18~42=YES, 43~67=NO)를 그대로 쓰면 정답이 드러납니다.
3. **규칙 판정은 엔진 한 곳에서.** 화면은 무엇을 하겠다는 요청만 보내고, 판정 결과를 받아 그립니다.

## P1에서 되는 것

- 방 만들기(6자리 숫자 코드) · 코드나 링크로 입장 · 방장이 시작 · 대기실에서 내보내기
- 좌석별로 걸러진 화면만 전송, 행동은 소켓에 묶인 좌석으로만 처리 (남의 자리 행동 불가)
- 새로고침·와이파이 끊김 뒤 좌석 토큰으로 같은 자리 복귀, 끊긴 사람의 차례는 45초 뒤 자동으로 넘어감
- 검증 창 10초 · 방어 창 5초 서버 타이머, 검증 결과 정답 공개 화면
- 라운드 정산 → 다음 라운드 → 최종 결과 화면
- 30분 동안 아무 일도 없는 방은 자동으로 닫힘

## 다음 단계 (P2)

연출과 효과음, 튜토리얼, 카드 확대 보기, 라운드 학습 리뷰(놓친 오답), 사전 활동 퀴즈,
좀비 모드·재대결·관전 모드, PWA 설치와 폰 세로 화면 다듬기.
