#!/bin/bash

# BangSong News 서비스 설치 스크립트

set -e

SERVICE_NAME="bangsong-news"
SERVICE_FILE="bangsong-news.service"
SYSTEMD_DIR="/etc/systemd/system"

echo "=== BangSong News 서비스 설치 시작 ==="

# 현재 디렉토리 확인
if [ ! -f "$SERVICE_FILE" ]; then
    echo "ERROR: $SERVICE_FILE 파일을 찾을 수 없습니다."
    echo "이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
    exit 1
fi

# systemd 서비스 파일 복사
echo "1. systemd 서비스 파일 설치 중..."
sudo cp "$SERVICE_FILE" "$SYSTEMD_DIR/"

# systemd 데몬 리로드
echo "2. systemd 데몬 리로드 중..."
sudo systemctl daemon-reload

# 서비스 활성화
echo "3. 서비스 활성화 중..."
sudo systemctl enable "$SERVICE_NAME"

echo "=== 설치 완료 ==="
echo ""
echo "서비스 관리 명령어:"
echo "  시작:    sudo systemctl start $SERVICE_NAME"
echo "  중지:    sudo systemctl stop $SERVICE_NAME"
echo "  재시작:  sudo systemctl restart $SERVICE_NAME"
echo "  상태:    sudo systemctl status $SERVICE_NAME"
echo "  로그:    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "부팅 시 자동 시작이 활성화되었습니다."
