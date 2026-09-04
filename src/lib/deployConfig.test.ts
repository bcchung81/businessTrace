import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

/**
 * 배포 자산은 앱 코드가 실제로 기대는 곳이다. 여기가 어긋나면 테스트는 전부 초록인데 서버만 이상하게 돈다.
 * 그래서 「코드가 프록시·유닛에 무엇을 요구하는가」만 검사한다 — 취향이 아니라 의존이다.
 */
describe("nginx 설정이 앱이 기대는 것을 준다", () => {
  const conf = read("deploy/nginx.conf");

  test("X-Forwarded-For 를 이어 붙인다 — 레이트리밋이 그 마지막 값을 접속 주소로 쓴다", () => {
    expect(conf).toMatch(/proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for\s*;/);
  });

  test("버퍼링을 끈다 — 배치 진행률이 SSE 라 버퍼에 갇히면 화면이 멈춘 것처럼 보인다", () => {
    expect(conf).toMatch(/proxy_buffering\s+off\s*;/);
  });

  test("배치가 도는 동안 연결을 끊지 않는다", () => {
    const timeout = /proxy_read_timeout\s+(\d+)s?\s*;/.exec(conf);
    expect(timeout, "proxy_read_timeout 이 없다").not.toBeNull();
    expect(Number(timeout![1])).toBeGreaterThanOrEqual(3600);
  });

  test("Host 를 넘긴다 — Auth.js 가 호스트를 못 믿으면 세션 요청을 전부 막는다", () => {
    expect(conf).toMatch(/proxy_set_header\s+Host\s+\$host\s*;/);
  });
});

describe("systemd 유닛", () => {
  const unit = read("deploy/seonggwa.service");

  test("root 로 돌지 않는다", () => {
    const user = /^User=(.+)$/m.exec(unit)?.[1];
    expect(user).toBeDefined();
    expect(user).not.toBe("root");
  });

  test("비밀은 유닛 파일이 아니라 EnvironmentFile 에서 온다", () => {
    expect(unit).toMatch(/^EnvironmentFile=/m);
    expect(unit, "유닛에 값을 직접 적으면 systemctl show 로 전부 읽힌다").not.toMatch(/^Environment=.*(SECRET|API_KEY|SERVICE_KEY)/m);
  });

  test("루프백에만 연다 — TLS 는 앞단 nginx 가 끊는다", () => {
    expect(unit).toMatch(/ExecStart=.*-H\s+127\.0\.0\.1/);
  });

  test("죽으면 다시 띄운다", () => {
    expect(unit).toMatch(/^Restart=/m);
  });
});

describe("배포 스크립트", () => {
  const deploy = read("deploy/deploy.sh");

  test("마이그레이션 전에 서버를 멈춘다 — 낡은 코드가 새 스키마 위에서 도는 창이 생기면 안 된다", () => {
    const stop = deploy.search(/systemctl\s+stop/);
    const migrate = deploy.search(/migrate\s+deploy/);
    const start = deploy.search(/systemctl\s+(start|restart)/);
    expect(stop, "stop 이 없다").toBeGreaterThan(-1);
    expect(migrate, "migrate 가 없다").toBeGreaterThan(-1);
    expect(stop).toBeLessThan(migrate);
    expect(migrate).toBeLessThan(start);
  });

  test("한 줄이라도 실패하면 멈춘다", () => {
    expect(deploy).toMatch(/set -[a-z]*e/);
  });

  test("저장소에 .env 가 남아 있으면 배포를 멈춘다", () => {
    // Next 는 작업 디렉터리의 .env 를 읽는다. 서버에 하나 놓여 있으면 EnvironmentFile 에 없는 키를
    // 조용히 채워, 기동 시 환경변수 게이트가 잡아야 할 누락을 통과시킨다(실측 확인).
    expect(deploy).toMatch(/\$APP_DIR\/\.env|\$\{APP_DIR\}\/\.env/);
    expect(deploy).toMatch(/exit 1/);
  });
});

describe("백업", () => {
  const backup = read("deploy/backup.sh");

  test("쓰기 중인 파일을 그대로 복사하지 않는다", () => {
    expect(backup).toMatch(/VACUUM INTO|\.backup/);
    expect(backup, "cat 으로 뜬 스냅샷은 열리지 않을 수 있다").not.toMatch(/cat\s+.*\.db/);
  });

  test("떠 놓은 파일이 열리는지 그 자리에서 확인한다", () => {
    expect(backup).toMatch(/integrity_check/);
  });

  test("무한정 쌓이지 않는다", () => {
    expect(backup).toMatch(/-mtime/);
  });
});

describe("배포 경로는 하나다", () => {
  test("쓰지 않는 도커 자산이 남아 있지 않다 — 두 경로가 갈라지면 어느 쪽도 못 믿는다", () => {
    for (const file of ["deploy/Dockerfile.web", "deploy/docker-compose.prod.yml", "deploy/entrypoint.sh"]) {
      expect(existsSync(resolve(process.cwd(), file)), `${file} 이 남아 있다`).toBe(false);
    }
  });

  test(".env.example 은 git 이 추적한다 — 서버에서 clone 한 직후에도 키 목록이 있어야 한다", () => {
    const rules = read(".gitignore").split("\n").map((line) => line.trim());
    expect(rules.indexOf("!.env.example")).toBeGreaterThan(rules.indexOf(".env*"));
  });
});
