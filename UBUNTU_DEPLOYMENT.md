# 우분투 서버 배포 가이드

이 문서는 BangSong News 애플리케이션을 우분투 서버에 배포하는 방법을 설명합니다.

## 🚀 빠른 시작

### 1. 시스템 요구사항
- Ubuntu 20.04 LTS 이상
- Python 3.12+
- 최소 2GB RAM
- 최소 10GB 디스크 공간

### 2. 시스템 패키지 설치
```bash
sudo apt update
sudo apt install -y python3.12-venv python3-pip lsof build-essential
```

### 3. 애플리케이션 설정
```bash
cd /home/kca1000plus/bangsong/news-homepage

# 가상환경 생성
python3 -m venv venv

# 가상환경 활성화
source venv/bin/activate

# 의존성 설치
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. 서버 실행 (개발 모드)
```bash
# 직접 실행
python run.py

# 또는 서버 스크립트 사용
./server.sh start
```

### 5. systemd 서비스 설치 (프로덕션)
```bash
# 서비스 설치
./install-service.sh

# 서비스 시작
sudo systemctl start bangsong-news

# 서비스 상태 확인
sudo systemctl status bangsong-news
```

## 📋 주요 변경사항 (macOS → Ubuntu)

### 패키지 업데이트
- Flask: 2.3.3 → 3.0.3
- requests: 2.31.0 → 2.32.3
- beautifulsoup4: 4.12.2 → 4.12.3
- pytz: 2023.3 → 2024.1
- openai: 1.3.0 → 1.51.0
- 추가: flask-sqlalchemy, urllib3, werkzeug

### 시스템 호환성
- macOS `.DS_Store` 파일 제거
- Linux 경로 구분자 호환성 확인
- Ubuntu 시스템 명령어 호환성 (lsof, ps 등)

### 새로운 기능
- systemd 서비스 지원
- 자동 부팅 시 시작
- 서비스 로그 관리

## 🔧 서비스 관리

### systemd 명령어
```bash
# 서비스 시작
sudo systemctl start bangsong-news

# 서비스 중지
sudo systemctl stop bangsong-news

# 서비스 재시작
sudo systemctl restart bangsong-news

# 서비스 상태 확인
sudo systemctl status bangsong-news

# 부팅 시 자동 시작 활성화
sudo systemctl enable bangsong-news

# 부팅 시 자동 시작 비활성화
sudo systemctl disable bangsong-news
```

### 로그 확인
```bash
# 실시간 로그 확인
sudo journalctl -u bangsong-news -f

# 최근 로그 확인
sudo journalctl -u bangsong-news -n 50

# 특정 날짜 로그 확인
sudo journalctl -u bangsong-news --since "2025-09-30"
```

### 기존 서버 스크립트 사용
```bash
# 서버 시작
./server.sh start

# 서버 중지
./server.sh stop

# 서버 재시작
./server.sh restart

# 서버 상태 확인
./server.sh status

# 로그 확인
./server.sh logs
```

## 🌐 접속 정보

- **메인 페이지**: http://서버IP:5001
- **로그인 페이지**: http://서버IP:5001/auth/login
- **API 엔드포인트**: http://서버IP:5001/api/

## 🔒 보안 설정

### 방화벽 설정
```bash
# UFW 활성화
sudo ufw enable

# 포트 5001 허용
sudo ufw allow 5001

# SSH 포트 허용 (필요시)
sudo ufw allow 22
```

### 환경 변수 설정
```bash
# .env 파일 생성 (선택사항)
cp .env.example .env
nano .env
```

## 📊 모니터링

### 서버 리소스 확인
```bash
# CPU 및 메모리 사용량
htop

# 디스크 사용량
df -h

# 네트워크 연결 확인
netstat -tlnp | grep :5001
```

### 애플리케이션 로그
```bash
# 애플리케이션 로그 파일
tail -f /home/kca1000plus/bangsong/news-homepage/server.log
```

## 🛠️ 문제 해결

### 일반적인 문제

1. **포트 충돌**
   ```bash
   # 포트 사용 프로세스 확인
   lsof -i:5001
   
   # 프로세스 종료
   sudo kill -9 <PID>
   ```

2. **권한 문제**
   ```bash
   # 파일 권한 확인
   ls -la /home/kca1000plus/bangsong/news-homepage/
   
   # 권한 수정
   chmod +x server.sh
   chmod +x install-service.sh
   ```

3. **가상환경 문제**
   ```bash
   # 가상환경 재생성
   rm -rf venv
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. **의존성 문제**
   ```bash
   # 시스템 패키지 설치
   sudo apt install -y python3.12-dev python3.12-venv build-essential
   ```

### 로그 분석
```bash
# systemd 서비스 로그
sudo journalctl -u bangsong-news --no-pager

# 애플리케이션 에러 로그
grep -i error /home/kca1000plus/bangsong/news-homepage/server.log
```

## 📞 지원

문제가 발생하면 다음을 확인하세요:

1. **시스템 로그**: `sudo journalctl -u bangsong-news -f`
2. **애플리케이션 로그**: `tail -f server.log`
3. **네트워크 상태**: `netstat -tlnp | grep :5001`
4. **서비스 상태**: `sudo systemctl status bangsong-news`

---

**개발자**: AI Assistant  
**버전**: 2.0.0 (Ubuntu 포팅)  
**라이선스**: MIT
