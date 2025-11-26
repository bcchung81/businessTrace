#!/bin/bash

# 뉴스 홈페이지 서버 관리 스크립트
# 사용법: ./server.sh [start|stop|restart|status]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/server.pid"
LOG_FILE="$SCRIPT_DIR/server.log"
PORT=5001

# 스크립트 실행 권한 확인
if [ ! -x "$0" ]; then
    echo "스크립트 실행 권한이 없습니다. 다음 명령어를 실행하세요:"
    echo "chmod +x $0"
    exit 1
fi

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error_log() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

# 서버 시작
start_server() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            error_log "서버가 이미 실행 중입니다. (PID: $pid)"
            return 1
        else
            log "이전 PID 파일을 정리합니다."
            rm -f "$PID_FILE"
        fi
    fi
    
    log "서버를 시작합니다..."
    
    # 작업 디렉토리로 이동
    cd "$SCRIPT_DIR" || {
        error_log "작업 디렉토리로 이동할 수 없습니다: $SCRIPT_DIR"
        return 1
    }
    
    # 가상환경 확인
    if [ ! -d "venv" ]; then
        error_log "가상환경을 찾을 수 없습니다. 먼저 가상환경을 생성해주세요."
        error_log "python -m venv venv"
        return 1
    fi
    
    # Python 실행 파일 확인
    if [ ! -f "venv/bin/python" ]; then
        error_log "가상환경의 Python 실행 파일을 찾을 수 없습니다."
        error_log "가상환경을 다시 생성해주세요: python -m venv venv"
        return 1
    fi
    
    # run.py 파일 확인
    if [ ! -f "run.py" ]; then
        error_log "run.py 파일을 찾을 수 없습니다."
        return 1
    fi
    
    # 포트 사용 확인
    if lsof -i:$PORT > /dev/null 2>&1; then
        error_log "포트 $PORT가 이미 사용 중입니다."
        error_log "다른 포트를 사용하거나 기존 프로세스를 종료해주세요."
        return 1
    fi
    
    # 백그라운드에서 서버 실행
    nohup venv/bin/python run.py > "$LOG_FILE" 2>&1 &
    local server_pid=$!
    
    # PID 저장
    echo "$server_pid" > "$PID_FILE"
    
    # 서버 시작 확인 (최대 10초 대기)
    local wait_count=0
    while [ $wait_count -lt 10 ]; do
        if ps -p "$server_pid" > /dev/null 2>&1; then
            # 포트에서 서비스 응답 확인
            sleep 2
            if lsof -i:$PORT > /dev/null 2>&1; then
                log "서버가 성공적으로 시작되었습니다. (PID: $server_pid, Port: $PORT)"
                log "웹 브라우저에서 http://localhost:$PORT 으로 접속하세요."
                return 0
            fi
        fi
        sleep 1
        wait_count=$((wait_count + 1))
    done
    
    error_log "서버 시작에 실패했습니다. 로그를 확인해주세요: tail -f $LOG_FILE"
    rm -f "$PID_FILE"
    return 1
}

# 서버 종료
stop_server() {
    if [ ! -f "$PID_FILE" ]; then
        log "서버가 실행 중이 아닙니다."
        return 0
    fi
    
    local pid=$(cat "$PID_FILE")
    log "서버를 종료합니다. (PID: $pid)"
    
    # 프로세스 종료
    if ps -p "$pid" > /dev/null 2>&1; then
        kill "$pid" 2>/dev/null
        
        # 5초 대기 후 강제 종료
        sleep 5
        if ps -p "$pid" > /dev/null 2>&1; then
            log "강제 종료를 시도합니다..."
            kill -9 "$pid" 2>/dev/null
        fi
        
        if ! ps -p "$pid" > /dev/null 2>&1; then
            log "서버가 성공적으로 종료되었습니다."
            rm -f "$PID_FILE"
            return 0
        else
            error_log "서버 종료에 실패했습니다."
            return 1
        fi
    else
        log "프로세스가 이미 종료되었습니다."
        rm -f "$PID_FILE"
        return 0
    fi
}

# 서버 재시작
restart_server() {
    log "서버를 재시작합니다..."
    
    # 현재 서버 상태 확인
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            log "기존 서버를 종료합니다. (PID: $pid)"
        fi
    fi
    
    # 서버 종료
    stop_server
    
    # 포트 해제 대기
    log "포트 해제를 기다립니다..."
    sleep 3
    
    # 서버 시작
    if start_server; then
        log "서버 재시작이 완료되었습니다."
    else
        error_log "서버 재시작에 실패했습니다."
        return 1
    fi
}

# 서버 상태 확인
check_status() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            log "서버가 실행 중입니다. (PID: $pid, Port: $PORT)"
            
            # 포트 사용 확인
            if lsof -i:$PORT > /dev/null 2>&1; then
                log "포트 $PORT에서 서비스가 정상적으로 실행 중입니다."
                log "웹 브라우저에서 http://localhost:$PORT 으로 접속하세요."
            else
                error_log "포트 $PORT에서 서비스가 실행되지 않고 있습니다."
            fi
            return 0
        else
            log "서버가 실행 중이 아닙니다. (PID 파일은 존재하지만 프로세스가 없음)"
            rm -f "$PID_FILE"
            return 1
        fi
    else
        log "서버가 실행 중이 아닙니다."
        return 1
    fi
}

# 로그 보기
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo -e "${BLUE}=== 서버 로그 (최근 50줄) ===${NC}"
        tail -n 50 "$LOG_FILE"
    else
        log "로그 파일이 없습니다."
    fi
}

# 도움말
show_help() {
    echo -e "${BLUE}뉴스 홈페이지 서버 관리 스크립트${NC}"
    echo ""
    echo "사용법: $0 [명령어]"
    echo ""
    echo "명령어:"
    echo "  start     - 서버 시작"
    echo "  stop      - 서버 종료"
    echo "  restart   - 서버 재시작"
    echo "  status    - 서버 상태 확인"
    echo "  logs      - 서버 로그 보기"
    echo "  help      - 도움말 보기"
    echo ""
    echo "예시:"
    echo "  $0 start    # 서버 시작"
    echo "  $0 stop     # 서버 종료"
    echo "  $0 restart  # 서버 재시작"
    echo "  $0 status   # 상태 확인"
}

# 메인 로직
case "${1:-help}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        check_status
        ;;
    logs)
        show_logs
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error_log "알 수 없는 명령어: $1"
        show_help
        exit 1
        ;;
esac 