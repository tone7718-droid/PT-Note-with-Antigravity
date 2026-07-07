/**
 * PT Note E2E 검증 스크립트 (Playwright)
 *
 * 사용법:
 *   npm run test:e2e
 *
 * - next dev 서버를 자체적으로 기동/종료합니다 (포트 3100).
 * - 브라우저는 playwright 기본 경로에서 찾으며, 없으면
 *   `npx playwright install chromium`으로 설치하세요.
 */
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── dev 서버 기동 ── */
async function startServer() {
  const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("dev 서버 기동 시간 초과")), 60000);
    server.stdout.on("data", (d) => {
      if (d.toString().includes("Ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on("exit", (code) => reject(new Error(`dev 서버 종료됨 (code ${code})`)));
  });
  return server;
}

function stopServer(server) {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

/* ── 테스트 헬퍼 ── */
let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS: ${name}`);
  } else {
    fail++;
    console.log(`  FAIL: ${name} ${extra}`);
  }
};

const main = async () => {
  const server = await startServer();
  const chromiumPath = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch(
    existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}
  );

  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message));

    const getNotes = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("pt_local_notes") || "[]"));
    const getTherapists = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("pt_local_therapists") || "[]"));
    const waitApp = () => page.waitForSelector('button:has-text("새 노트 작성")', { timeout: 15000 });
    const login = async (id, pw) => {
      await page.waitForSelector("#login-id", { timeout: 15000 });
      await page.fill("#login-id", id);
      await page.fill("#login-pw", pw);
      await page.click('button[type="submit"]:has-text("로그인")');
    };
    const newNote = async (name, chartNo, diagnosis) => {
      await page.click('button:has-text("새 노트 작성")');
      await sleep(400);
      await page.fill('input[name="patientName"]', name);
      if (chartNo) await page.fill('input[name="chartNo"]', chartNo);
      await page.fill('input[name="diagnosis"]', diagnosis);
      await page.click('button[type="submit"]:has-text("저장")');
      await page.waitForSelector("text=노트가 성공적으로 저장되었습니다", { timeout: 5000 });
      await sleep(300);
    };

    await page.goto(BASE);

    /* 자가 비밀번호 변경 헬퍼 (사이드바 상시 버튼 → 모달) */
    const changePassword = async (current, next, confirm = next) => {
      await page.click('button[aria-label="비밀번호 변경"]');
      await page.waitForSelector("#pw-current", { timeout: 5000 });
      await page.fill("#pw-current", current);
      await page.fill("#pw-new", next);
      await page.fill("#pw-new2", confirm);
      await page.getByRole("button", { name: "변경하기", exact: true }).click();
    };

    /* ── 1) master/0000 로그인: 차단하지 않고 배너만 표시 ── */
    await login("master", "0000");
    await waitApp();
    check("master/0000 로그인 시 앱 접근 가능 (차단 없음)", true);
    check("기본 비밀번호 경고 배너 표시", await page.isVisible("text=기본 비밀번호(0000) 사용 중"));
    check("상시 '비밀번호 변경' 버튼 표시", await page.isVisible('button[aria-label="비밀번호 변경"]'));

    // 현재 비밀번호 오류 (reauthenticate는 비동기 PBKDF2 — 에러 렌더까지 대기)
    await changePassword("wrongpw", "1234");
    const reauthRejected = await page
      .waitForSelector("text=현재 비밀번호가 일치하지 않습니다", { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    check("현재 비밀번호 불일치 거부", reauthRejected);
    // 확인 불일치
    await page.fill("#pw-current", "0000");
    await page.fill("#pw-new", "1234");
    await page.fill("#pw-new2", "9999");
    await page.getByRole("button", { name: "변경하기", exact: true }).click();
    check("새 비밀번호 확인 불일치 거부", await page.isVisible("text=새 비밀번호가 서로 일치하지 않습니다"));
    // 새 비밀번호 = 0000 거부
    await page.fill("#pw-new", "0000");
    await page.fill("#pw-new2", "0000");
    await page.getByRole("button", { name: "변경하기", exact: true }).click();
    check("새 비밀번호로 0000 거부", await page.isVisible("text=기본 비밀번호(0000)는 사용할 수 없습니다"));
    // 성공: 0000 → 1234
    await page.fill("#pw-new", "1234");
    await page.fill("#pw-new2", "1234");
    await page.getByRole("button", { name: "변경하기", exact: true }).click();
    await page.waitForSelector("text=비밀번호가 변경되었습니다", { timeout: 5000 });
    await sleep(1400);
    check("비밀번호 변경 성공 후 배너 사라짐", !(await page.isVisible("text=기본 비밀번호(0000) 사용 중")));

    // ★ 핵심 회귀: 연속 2회 변경 (1234 → Test!234 → 1234)
    await changePassword("1234", "Test!234");
    await page.waitForSelector("text=비밀번호가 변경되었습니다", { timeout: 5000 });
    await sleep(1400);
    check("특수문자 포함 비밀번호 변경 성공", true);
    await changePassword("Test!234", "1234");
    await page.waitForSelector("text=비밀번호가 변경되었습니다", { timeout: 5000 });
    await sleep(1400);
    check("연속 2회 이상 비밀번호 변경 가능 (핵심 버그 해결)", true);

    // PBKDF2 저장 확인
    const masterHash = (await getTherapists()).find((t) => t.id === "master")?.passwordHash || "";
    check("비밀번호가 PBKDF2 형식으로 저장됨", masterHash.startsWith("pbkdf2$"), `(${masterHash.slice(0, 12)})`);

    // 재로그인: 이전 비밀번호 거부, 새 비밀번호 통과 + 배너 없음
    await page.click('button:has-text("로그아웃")');
    await login("master", "0000");
    await sleep(700);
    check("변경 전 비밀번호(0000)로 로그인 불가", await page.isVisible("#login-id"));
    await login("master", "1234");
    await waitApp();
    check("새 비밀번호(1234)로 로그인 성공, 배너 없음", !(await page.isVisible("text=기본 비밀번호(0000) 사용 중")));

    /* ── 1b) 레거시 SHA-256 해시 계정: 로그인 시 PBKDF2 자동 업그레이드 ── */
    await page.evaluate(async () => {
      const enc = new TextEncoder().encode("legacy99");
      const buf = await crypto.subtle.digest("SHA-256", enc);
      const sha = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const ts = JSON.parse(localStorage.getItem("pt_local_therapists") || "[]");
      ts.push({ uid: "legacy-t", id: "PT-009", name: "레거시", passwordHash: sha, role: "therapist", resigned: false });
      localStorage.setItem("pt_local_therapists", JSON.stringify(ts));
    });
    await page.click('button:has-text("로그아웃")');
    await login("PT-009", "legacy99");
    await waitApp();
    check("레거시 SHA-256 해시로 로그인 성공", true);
    const upgraded = (await getTherapists()).find((t) => t.id === "PT-009")?.passwordHash || "";
    check("로그인 후 PBKDF2로 자동 업그레이드", upgraded.startsWith("pbkdf2$"), `(${upgraded.slice(0, 12)})`);
    await page.click('button:has-text("로그아웃")');
    await login("PT-009", "legacy99");
    await waitApp();
    check("업그레이드 후 동일 비밀번호로 재로그인", true);

    // 정리: 다운스트림 테스트를 위해 master로 복귀
    await page.click('button:has-text("로그아웃")');
    await login("master", "1234");
    await waitApp();

    /* ── 2) 자동 저장: 1회성 + 무한 루프 없음 ── */
    await page.fill('input[name="patientName"]', "홍길동");
    await page.fill('input[name="diagnosis"]', "요추 추간판 탈출증");
    await sleep(7000);
    let notes = await getNotes();
    check("자동 저장으로 노트 1건 생성", notes.length === 1, `(count=${notes.length})`);
    check("자동 저장 노트에 patientId 부여", !!notes[0]?.patientId, `(patientId=${notes[0]?.patientId})`);
    const firstSavedAt = notes[0]?.savedAt;
    await sleep(12000);
    notes = await getNotes();
    check(
      "입력 없을 때 반복 저장 없음 (무한 루프 없음)",
      notes.length === 1 && notes[0].savedAt === firstSavedAt,
      `(count=${notes.length})`
    );

    /* ── 3) 자동 저장 직후 타이핑 유지 + 중복 생성 없음 ── */
    await page.focus("#chiefComplaint");
    await page.type("#chiefComplaint", "허리 통증 3주째", { delay: 30 });
    const typed = await page.inputValue("#chiefComplaint");
    await sleep(7000);
    check("자동 저장 후 입력 유지", (await page.inputValue("#chiefComplaint")) === typed);
    notes = await getNotes();
    check("이어서 입력해도 같은 노트에 저장", notes.length === 1, `(count=${notes.length})`);

    /* ── 4) patientId: 동명이인 분리 / 같은 차트번호 병합 ── */
    await newNote("김철수", "A-100", "회전근개 파열");
    await newNote("김철수", "B-200", "족저근막염"); // 동명이인 (차트번호 다름)
    await newNote("김철수", "A-100", "회전근개 파열 f/u"); // 같은 환자 재방문
    notes = await getNotes();
    const a100 = notes.filter((n) => n.chartNo === "A-100");
    const b200 = notes.filter((n) => n.chartNo === "B-200");
    check("같은 차트번호는 같은 patientId", a100.length === 2 && a100[0].patientId === a100[1].patientId);
    check("동명이인(차트번호 다름)은 다른 patientId", b200.length === 1 && b200[0].patientId !== a100[0].patientId);

    // 추이 차트가 동명이인을 섞지 않는지 (A-100 김철수 → 2건만)
    const a100Item = page.locator('li:has-text("김철수")').first();
    await a100Item.hover();
    // 목록은 최신순: 맨 위 김철수는 A-100 f/u
    await page.click('li:has-text("김철수") >> nth=0 >> button[aria-label*="추이 보기"]');
    await page.waitForSelector("text=치료 추이", { timeout: 5000 });
    const trendCount = await page.textContent("text=/총 \\d+건의 기록/");
    check("추이 차트에 동명이인 제외 (총 2건)", trendCount?.includes("총 2건"), `(${trendCount})`);
    await page.click('button[aria-label="추이 차트 닫기"]');
    await page.waitForSelector("text=치료 추이", { state: "hidden", timeout: 5000 });

    /* ── 5) 노트 복사 시 patientId 유지 ── */
    // 목록 첫 항목(가장 최근 저장된 A-100 f/u)을 복사해 저장
    const firstItem = page.locator('li:has-text("김철수")').first();
    await firstItem.hover();
    await firstItem.locator('button[aria-label*="노트 복사"]').click();
    await sleep(400);
    await page.click('button[type="submit"]:has-text("저장")');
    await page.waitForSelector("text=노트가 성공적으로 저장되었습니다", { timeout: 5000 });
    await sleep(300);
    notes = await getNotes();
    const a100Now = notes.filter((n) => n.chartNo === "A-100");
    check(
      "복사한 노트도 같은 patientId 유지",
      a100Now.length === 3 && new Set(a100Now.map((n) => n.patientId)).size === 1,
      `(count=${a100Now.length})`
    );

    /* ── 6) 매크로 삽입 (native 이벤트 1회 전달) ── */
    await page.click('button[aria-label="매크로 문구 등록"]');
    await page.waitForSelector("text=매크로 문구 등록", { timeout: 5000 });
    await page.fill('textarea[placeholder*="/도수1에"]', "도수치료 30분 시행");
    await page.click('button:has-text("저장 (Save)")');
    await sleep(300);
    await page.focus("#clinical-treatment");
    await page.type("#clinical-treatment", "/도수", { delay: 40 });
    await page.waitForSelector("text=매크로 자동완성", { timeout: 3000 });
    await page.keyboard.press("Enter");
    await sleep(300);
    const treatmentVal = await page.inputValue("#clinical-treatment");
    check("매크로 삽입으로 텍스트 대체", treatmentVal === "도수치료 30분 시행", `("${treatmentVal}")`);
    await page.click('button[type="submit"]:has-text("저장")');
    await page.waitForSelector("text=노트가 성공적으로 저장되었습니다", { timeout: 5000 });
    await sleep(300);
    notes = await getNotes();
    check(
      "매크로 삽입 값이 폼(RHF)까지 반영되어 저장됨",
      notes.some((n) => n.treatment === "도수치료 30분 시행")
    );

    /* ── 7) 백업 내보내기: passwordHash 없음 / version 3 ── */
    // 치료사 1명 등록 (복원 테스트용)
    await page.click('button[aria-label="메뉴 열기"]');
    await page.click('button:has-text("치료사 등록 / 관리")');
    await page.fill("#reg-name", "박치료");
    await page.fill("#reg-id", "PT-001");
    await page.fill("#reg-pw", "5678");
    await page.click('button:has-text("등록하기")');
    await page.waitForSelector("text=등록 완료", { timeout: 5000 });
    await page.click('button[aria-label="모달 닫기"]');

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      (async () => {
        await page.click('button[aria-label="메뉴 열기"]');
        await page.click('button:has-text("데이터 내보내기")');
      })(),
    ]);
    const exportPath = await download.path();
    const exported = JSON.parse(readFileSync(exportPath, "utf8"));
    check("백업 version 3", exported.version === 3);
    check(
      "백업 therapists에 passwordHash 없음",
      Array.isArray(exported.therapists) &&
        exported.therapists.length > 0 &&
        exported.therapists.every((t) => !("passwordHash" in t)),
      JSON.stringify(Object.keys(exported.therapists?.[0] || {}))
    );
    check("백업 파일 전체에 passwordHash 문자열 없음", !readFileSync(exportPath, "utf8").includes("passwordHash"));

    /* ── 8) 초기화 → 가져오기 → 치료사 복원 + 비밀번호 재설정 ── */
    await page.evaluate(() => {
      localStorage.removeItem("pt_local_notes");
      localStorage.removeItem("pt_local_therapists");
    });
    await page.reload();
    await waitApp(); // 세션 유지로 바로 진입 (master는 bootstrap으로 재생성됨)

    page.once("dialog", (d) => d.accept());
    await page.click('button[aria-label="메뉴 열기"]');
    await page.click('button:has-text("데이터 가져오기")');
    await page.setInputFiles('input[type="file"]', exportPath);
    await sleep(1500);
    notes = await getNotes();
    const restoredTherapists = await getTherapists();
    const restored = restoredTherapists.find((t) => t.id === "PT-001");
    check("가져오기로 노트 복원", notes.length >= 5, `(count=${notes.length})`);
    check("가져오기로 치료사 복원 (비밀번호 미설정)", !!restored && restored.passwordHash === "");

    // 복원 계정은 로그인 불가 → master가 재설정 → 로그인 가능
    await page.click('button:has-text("로그아웃")');
    await login("PT-001", "5678");
    await page.waitForSelector("text=비밀번호가 설정되지 않은 계정입니다", { timeout: 5000 });
    check("복원 계정은 비밀번호 재설정 전 로그인 불가", true);

    await login("master", "0000"); // 초기화로 master가 0000으로 재생성됨
    await waitApp();
    await changePassword("0000", "9999"); // 배너 상태에서 자가 변경
    await page.waitForSelector("text=비밀번호가 변경되었습니다", { timeout: 5000 });
    await sleep(1400);

    // 일반 치료사(PT-005) 자가 비밀번호 변경 검증
    await page.click('button[aria-label="메뉴 열기"]');
    await page.click('button:has-text("치료사 등록 / 관리")');
    await page.fill("#reg-name", "자가변경");
    await page.fill("#reg-id", "PT-005");
    await page.fill("#reg-pw", "init01");
    await page.click('button:has-text("등록하기")');
    await page.waitForSelector("text=등록 완료", { timeout: 5000 });
    await page.click('button[aria-label="모달 닫기"]');
    await page.click('button:has-text("로그아웃")');
    await login("PT-005", "init01");
    await waitApp();
    await changePassword("init01", "New@5678");
    await page.waitForSelector("text=비밀번호가 변경되었습니다", { timeout: 5000 });
    await sleep(1400);
    await page.click('button:has-text("로그아웃")');
    await login("PT-005", "New@5678");
    await waitApp();
    check("일반 치료사도 자가 비밀번호 변경 후 재로그인", true);
    await page.click('button:has-text("로그아웃")');
    await login("master", "9999");
    await waitApp();

    await page.click('button[aria-label="메뉴 열기"]');
    await page.click('button:has-text("치료사 등록 / 관리")');
    await page.click('button:has-text("치료사 목록")');
    page.once("dialog", (d) => d.accept());
    await page.click('button[aria-label="박치료 비밀번호 재설정"]');
    await page.fill("#reset-pw", "5678");
    await page.getByRole("button", { name: "재설정", exact: true }).click();
    await sleep(500);
    await page.click('button[aria-label="모달 닫기"]');
    await page.click('button:has-text("로그아웃")');
    await login("PT-001", "5678");
    await waitApp();
    check("비밀번호 재설정 후 복원 계정 로그인 성공", true);

    /* ── 9) 손상 데이터 방어: painScore 999 / 잘못된 날짜 ── */
    const badPath = join(mkdtempSync(join(tmpdir(), "pt-e2e-")), "bad.json");
    writeFileSync(
      badPath,
      JSON.stringify({
        version: 3,
        notes: [
          { id: "bad-1", patientName: "불량", diagnosis: "x", painScore: 999, painAreas: {}, chartNo: "", birthDate: "", gender: "", pmh: "", chiefComplaint: "", rom: [], postural: "", palpation: "", specialTest: "", treatment: "", homeExercise: "", noteDate: "" },
          { id: "ok-1", savedAt: "invalid-date", patientName: "정상환자", diagnosis: "y", painScore: 5, painAreas: {}, chartNo: "", birthDate: "", gender: "", pmh: "", chiefComplaint: "", rom: [], postural: "", palpation: "", specialTest: "", treatment: "", homeExercise: "", noteDate: "" },
        ],
        therapists: [],
      })
    );
    await page.click('button:has-text("로그아웃")');
    await login("master", "9999");
    await waitApp();
    page.once("dialog", (d) => d.accept());
    await page.click('button[aria-label="메뉴 열기"]');
    await page.click('button:has-text("데이터 가져오기")');
    await page.setInputFiles('input[type="file"]', badPath);
    await sleep(1500);
    notes = await getNotes();
    check("painScore 999 노트는 걸러짐", !notes.some((n) => n.id === "bad-1"));
    check("유효 노트는 들어옴", notes.some((n) => n.id === "ok-1"));
    const sidebarText = await page.textContent("ul.p-3");
    check(
      "잘못된 savedAt이 NaN.NaN.NaN 대신 원문 표시",
      !!sidebarText && !sidebarText.includes("NaN") && sidebarText.includes("invalid-date"),
      `(sidebar="${sidebarText?.slice(0, 80)}...")`
    );

    /* ── 10) 백필: patientId 없는 기존 노트에 자동 부여 ── */
    await page.evaluate(() => {
      const notes = JSON.parse(localStorage.getItem("pt_local_notes") || "[]");
      notes.push(
        { id: "legacy-1", savedAt: "2025-01-01T00:00:00.000Z", patientName: "구환자", chartNo: "OLD-1", diagnosis: "z", painScore: null, painAreas: {}, birthDate: "", gender: "", pmh: "", chiefComplaint: "", rom: [], postural: "", palpation: "", specialTest: "", treatment: "", homeExercise: "", noteDate: "2025-01-01" },
        { id: "legacy-2", savedAt: "2025-02-01T00:00:00.000Z", patientName: "구환자", chartNo: "OLD-1", diagnosis: "z", painScore: null, painAreas: {}, birthDate: "", gender: "", pmh: "", chiefComplaint: "", rom: [], postural: "", palpation: "", specialTest: "", treatment: "", homeExercise: "", noteDate: "2025-02-01" }
      );
      localStorage.setItem("pt_local_notes", JSON.stringify(notes));
    });
    await page.reload();
    await waitApp();
    notes = await getNotes();
    const legacy = notes.filter((n) => n.id?.startsWith("legacy-"));
    check("백필: 기존 노트에 patientId 부여", legacy.length === 2 && legacy.every((n) => !!n.patientId));
    check("백필: 같은 차트번호끼리 같은 patientId", legacy[0]?.patientId === legacy[1]?.patientId);

    /* ── 11) Body Diagram: 해부학 인체도 클릭 → 통증 단계 → 저장 ── */
    await page.click('button:has-text("새 노트 작성")');
    await sleep(400);
    await page.fill('input[name="patientName"]', "다이어그램");
    await page.fill('input[name="diagnosis"]', "테스트");

    // SVG는 화면에서 축소 렌더링되므로 bbox 비율로 클릭 지점 계산
    // (대흉근 하단 — 위에 겹친 소흉근(심부)·복직근을 피하는 지점)
    const clickAt = async (loc, fx, fy) => {
      await loc.scrollIntoViewIfNeeded(); // mouse.click은 자동 스크롤이 없음
      const box = await loc.boundingBox();
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    };
    const pec = page.locator('svg[aria-label="전면부 해부도"] [data-name="우측 대흉근"]');
    await clickAt(pec, 0.49, 0.73);
    await sleep(200);
    check("근육 클릭 1회 → 경도(pain-1)", ((await pec.getAttribute("class")) || "").includes("pain-1"));
    check("기록된 부위 칩 갱신", await page.isVisible("text=기록된 부위 (1)"));

    // 미러(좌측) 도형도 독립적으로 동작하는지
    const pecL = page.locator('svg[aria-label="전면부 해부도"] [data-name="좌측 대흉근"]');
    await clickAt(pecL, 0.51, 0.73);
    await sleep(200);
    check("미러(좌측) 근육 클릭 동작", ((await pecL.getAttribute("class")) || "").includes("pain-1"));
    check("기록된 부위 2건", await page.isVisible("text=기록된 부위 (2)"));

    await clickAt(pec, 0.49, 0.73);
    await sleep(150);
    await clickAt(pec, 0.49, 0.73);
    await sleep(150);
    check("3회 클릭 → 중증(pain-3)", ((await pec.getAttribute("class")) || "").includes("pain-3"));

    await page.click('button[type="submit"]:has-text("저장")');
    await page.waitForSelector("text=노트가 성공적으로 저장되었습니다", { timeout: 5000 });
    await sleep(300);
    notes = await getNotes();
    const diagNote = notes.find((n) => n.patientName === "다이어그램");
    check(
      "painAreas 저장 (우측 대흉근=3, 좌측 대흉근=1)",
      diagNote?.painAreas?.["우측 대흉근"] === 3 && diagNote?.painAreas?.["좌측 대흉근"] === 1
    );

    await clickAt(pec, 0.49, 0.73);
    await sleep(200);
    check("4회 클릭 → 해제", !((await pec.getAttribute("class")) || "").includes("pain-"));

    /* ── 12) 기존 노트(구 도형 시절 painAreas)가 새 인체도에 올바르게 표시 ── */
    await page.evaluate(() => {
      const notes = JSON.parse(localStorage.getItem("pt_local_notes") || "[]");
      notes.push({
        id: "legacy-pain", savedAt: "2025-03-01T00:00:00.000Z", patientName: "통증호환", diagnosis: "y",
        painScore: null, painAreas: { "좌측 상부승모근": 2, "우측 무릎뼈 (Patella)": 1 },
        chartNo: "", birthDate: "", gender: "", pmh: "", chiefComplaint: "", rom: [],
        postural: "", palpation: "", specialTest: "", treatment: "", homeExercise: "", noteDate: "2025-03-01",
      });
      localStorage.setItem("pt_local_notes", JSON.stringify(notes));
    });
    await page.reload();
    await waitApp();
    await page.click('li:has-text("통증호환")');
    await sleep(600);
    const trap = page.locator('svg[aria-label="후면부 해부도"] [data-name="좌측 상부승모근"]');
    check("기존 노트 통증 부위 표시 (좌측 상부승모근 pain-2)", ((await trap.getAttribute("class")) || "").includes("pain-2"));
    const patella = page.locator('svg[aria-label="전면부 해부도"] [data-name="우측 무릎뼈 (Patella)"]');
    check("뼈 랜드마크 통증 표시 (우측 무릎뼈 pain-1)", ((await patella.getAttribute("class")) || "").includes("pain-1"));

    /* ── 콘솔 에러 ── */
    const realErrors = consoleErrors.filter(
      (e) => !e.includes("Download the React DevTools") && !e.includes("비밀번호가 설정되지 않은")
    );
    check("콘솔 에러 없음", realErrors.length === 0, JSON.stringify(realErrors.slice(0, 3)));
  } finally {
    await browser.close();
    stopServer(server);
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
