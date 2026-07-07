# PT Note — 물리치료 환자 평가지

물리치료사용 프로그레스 노트(환자 평가지) 작성 앱입니다. Next.js(정적 export) 기반 웹앱이며, Electron으로 데스크톱 앱 패키징도 지원합니다.

## 주요 기능

- 환자 기본 정보, 주호소, 인체 통증 부위(전면/후면 다이어그램), ROM 측정, 임상 기록 작성
- 5초 디바운스 자동 임시 저장
- `/도수` 매크로 자동완성 (자주 쓰는 문구 20개 등록)
- 환자별 통증 점수(NRS)·ROM 추이 그래프
- 치료사 계정 관리 (등록 / 퇴사 처리 / 기록 이관), master 계정
- 인쇄 / PDF 저장, 데이터 내보내기·가져오기(JSON 백업)

## 실행 방법

```bash
npm install
npm run dev            # 웹 (http://localhost:3000)
npm run electron:dev   # Electron 개발 모드
npm run electron:build # Electron 배포 빌드 (dist/)
npm run typecheck      # TypeScript 검사
npm run test:e2e       # Playwright E2E 테스트 (dev 서버 자동 기동)
```

기본 마스터 계정: ID `master` / 비밀번호 `0000`. 기본 비밀번호로 로그인하면 사이드바에 변경 권장 배너가 표시됩니다(차단하지 않음). 사이드바의 **비밀번호 변경** 버튼으로 언제든 본인 비밀번호를 바꿀 수 있으며(master·일반 치료사 공통, 횟수 제한 없음), 현재 비밀번호 확인 후 4~20자 영문/숫자/특수문자로 변경합니다.

## 데이터 저장 방식

현재 **로컬 모드**(`src/lib/localDataService.ts`)로 동작하며 모든 데이터가 브라우저 `localStorage`에 저장됩니다. Supabase 클라우드 모드(`src/lib/dataService.ts`)로 전환하려면 `useNoteStore.ts` / `useAuthStore.ts`의 import를 `@/lib/dataService`로 바꾸고 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 환경변수를 설정하세요.

## ⚠️ 보안 주의사항 (로컬 모드)

로컬 모드는 개인 기기에서의 단독 사용을 전제로 하며, 다음 한계가 있습니다.

- **환자 의료정보가 브라우저 localStorage에 평문으로 저장됩니다.** 같은 기기·브라우저 프로필에 접근할 수 있는 사람은 개발자 도구로 로그인 없이 데이터를 열람할 수 있습니다. 로그인은 UI 수준의 보호일 뿐입니다.
- 비밀번호는 salt를 적용한 PBKDF2(SHA-256) 해시로 저장됩니다(기존 SHA-256 해시는 로그인 시 자동 업그레이드). 내보내기(JSON 백업)에는 비밀번호 해시가 포함되지 않지만, 환자 정보는 평문으로 담기므로 백업 파일은 안전한 곳에 보관하세요.
- 백업에서 복원된 치료사 계정은 비밀번호가 없는 상태이며, master가 치료사 관리 > 비밀번호 재설정으로 활성화해야 로그인할 수 있습니다.
- 공용 PC에서는 사용하지 마시고, 실제 환자 정보를 다룰 경우 기기 암호화(BitLocker/FileVault)와 OS 계정 잠금을 함께 사용하세요.

위 항목들은 Supabase 모드(서버 측 인증·Row Level Security)로 전환하면 해소됩니다.
