# 뉴스 홈페이지 서버

네이버 뉴스 API와 구글 뉴스를 통합한 뉴스 검색 시스템입니다.

## 🚀 빠른 시작

### 1. 가상환경 설정
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. 서버 실행
```bash
python run.py
```

### 3. 서버 접속
- 메인 페이지: http://localhost:5000

## 📋 주요 기능

### 뉴스 검색
- 실시간 뉴스 검색
- 다양한 검색 조건 (전체, AND, OR)
- RSS 피드 기반 뉴스 수집
- 자동 새로고침 (5분 주기)

### 뉴스 소스
- 전자신문 (ETNews)
- 매일경제 (MK)
- 보안뉴스 (BoanNews)
- 연합뉴스 (Yonhap)

### 알람 기능
- 키워드 기반 뉴스 알람
- 실시간 알림
- 브라우저 알림 지원

### 사용자 인터페이스
- 다크 모드 지원
- 반응형 디자인
- 커스텀 키워드 추가
- 직관적인 검색 인터페이스

## ⚙️ 설정 기능

### 설정 가능한 항목
- **검색 결과 개수**: 10~200개 (기본값: 50개)
- **뉴스 소스**: 개별 RSS 소스 활성화/비활성화
- **자동 새로고침**: 5분 주기
- **알람 키워드**: 사용자 정의 키워드 설정

## 🔧 개발 환경

### 요구사항
- Python 3.7+
- Flask
- requests
- beautifulsoup4
- feedparser
- python-dateutil
- pytz

### 프로젝트 구조
```
news-homepage/
├── app/
│   ├── __init__.py
│   ├── routes.py              # 라우트 정의
│   ├── news_service.py        # 뉴스 검색 서비스
│   ├── templates/
│   │   └── index.html         # 메인 페이지
│   └── static/
│       ├── css/style.css      # 스타일시트
│       └── js/app.js          # JavaScript
├── run.py                     # Flask 앱 실행
├── requirements.txt           # 의존성 목록
└── README.md                  # 프로젝트 문서
```

## 📊 API 엔드포인트

### 뉴스 API
- `GET /api/news` - 기본 뉴스 목록
- `GET /api/news/all` - 모든 뉴스 (최대 50개)
- `GET /api/news/<category>` - 카테고리별 뉴스
- `GET /api/search?q=<검색어>` - 뉴스 검색
- `GET /api/search/progress` - 검색 진행 상황

### 알람 API
- `GET /api/alert/status` - 알람 상태 조회
- `POST /api/alert/toggle` - 알람 토글
- `GET /api/alert/keywords` - 알람 키워드 목록
- `POST /api/alert/keywords` - 알람 키워드 저장
- `GET /api/alert/check/<keyword>` - 특정 키워드 알람 확인
- `GET /api/alert/check-all` - 모든 키워드 알람 확인

## 🔍 뉴스 소스

### RSS 피드
- 전자신문: https://www.etnews.com/RSS/S1N1.xml
- 매일경제: https://www.mk.co.kr/rss/30000001/
- 보안뉴스: https://www.boannews.com/media/news_rss.xml
- 연합뉴스: https://www.yonhapnews.co.kr/feed/

## 🛠️ 문제 해결

### 서버가 시작되지 않는 경우
1. 가상환경 확인: `ls venv/`
2. 의존성 설치: `pip install -r requirements.txt`
3. 포트 충돌 확인: `netstat -tlnp | grep :5000`

### 뉴스가 로드되지 않는 경우
1. 인터넷 연결 확인
2. RSS 피드 URL 접근 가능 여부 확인
3. 브라우저 개발자 도구에서 네트워크 오류 확인

## 📞 지원

문제가 발생하면 다음을 확인하세요:
1. 브라우저 콘솔 오류 확인
2. 서버 로그 확인
3. 네트워크 연결 상태 확인

---

**개발자**: AI Assistant  
**버전**: 1.0.0  
**라이선스**: MIT 