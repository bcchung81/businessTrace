import requests
from datetime import datetime
import pytz
from urllib.parse import quote
import xml.etree.ElementTree as ET
import re
import time

class NewsService:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
        # SSL 검증 비활성화
        self.session.verify = False
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        # 네이버 뉴스 API 설정
        self.naver_news_url = "https://openapi.naver.com/v1/search/news.json"
        self.naver_client_id = "htCujKMCJaJ4pgTxpITY"
        self.naver_client_secret = "PjZL2dIzf3"
        
        # 캐시 클리어를 위한 타임스탬프
        self._last_cache_clear = time.time()
        self._cache_clear_interval = 300  # 5분마다 캐시 클리어
        
        # 도메인별 언론사명 매핑
        self.domain_to_press = {
            # 기존 매핑
            'kjdaily.com': '광주일보',
            'jndn.com': '전남일보',
            'etnews.com': '전자신문',
            'news.naver.com': '네이버뉴스',
            'n.news.naver.com': '네이버뉴스',
            'chosun.com': '조선일보',
            'joongang.co.kr': '중앙일보',
            'donga.com': '동아일보',
            'hankookilbo.com': '한국일보',
            'seoul.co.kr': '서울신문',
            'khan.co.kr': '경향신문',
            'hani.co.kr': '한겨레',
            'ohmynews.com': '오마이뉴스',
            'yonhapnews.co.kr': '연합뉴스',
            'newsis.com': '뉴시스',
            'news1.kr': '뉴스1',
            'edaily.co.kr': '이데일리',
            'fnnews.com': '파이낸셜뉴스',
            'biz.chosun.com': '조선비즈',
            'mk.co.kr': '매일경제',
            'hankyung.com': '한국경제',
            'sedaily.com': '서울경제',
            'inews24.com': '아이뉴스24',
            'zdnet.co.kr': 'ZDNet Korea',
            'itworld.co.kr': 'ITWorld',
            'techm.kr': '테크M',
            'zdnet.com': 'ZDNet',
            'cnet.com': 'CNET',
            'techcrunch.com': 'TechCrunch',
            'wired.com': 'Wired',
            'theverge.com': 'The Verge',
            'engadget.com': 'Engadget',
            'ars-technica.com': 'Ars Technica',
            'venturebeat.com': 'VentureBeat',
            'reuters.com': 'Reuters',
            'bloomberg.com': 'Bloomberg',
            'cnn.com': 'CNN',
            'bbc.com': 'BBC',
            'nytimes.com': 'The New York Times',
            'wsj.com': 'The Wall Street Journal',
            'ft.com': 'Financial Times',
            'economist.com': 'The Economist',
            # 추가된 도메인 매핑
            'boannews.com': '보안뉴스',
            'digitaltoday.co.kr': '디지털투데이',
            'news.mtn.co.kr': 'MTN뉴스',
            'itbiznews.com': 'ITBizNews',
            'ddaily.co.kr': '디지털데일리',
            'hellot.net': '헬로T',
            'dailysecu.com': '데일리시큐',
            'news2day.co.kr': '뉴스투데이',
            'datanet.co.kr': 'DATANET',
            'view.asiae.co.kr': '아시아경제',
            'tokenpost.kr': 'TOKENPOST',
            'decenter.kr': '디쎈터',
            'news.mt.co.kr': '머니투데이',
            'magazine.hankyung.com': '한경비즈니스',
            'byline.network': '바이라인네트워크',
            # JSON 파일에서 추가된 도메인 매핑
            'segye.com': '세계일보',
            'kmib.co.kr': '국민일보',
            'munhwa.com': '문화일보',
            'heraldcorp.com': '헤럴드경제',
            'asiae.co.kr': '아시아경제',
            'mt.co.kr': '머니투데이',
            'dt.co.kr': '디지털타임스',
            'newspim.com': '뉴스핌',
            'kbs.co.kr': 'KBS',
            'imbc.com': 'MBC',
            'sbs.co.kr': 'SBS',
            'jtbc.co.kr': 'JTBC',
            'ytn.co.kr': 'YTN',
            'mbn.co.kr': 'MBN',
            'tvchosun.com': 'TV조선',
            'ichannela.com': '채널A',
            'yonhapnewstv.co.kr': '연합뉴스TV',
            'obs.co.kr': 'OBS경인TV',
            'tbs.seoul.kr': 'TBS교통방송',
            'pressian.com': '프레시안',
            'nocutnews.co.kr': '노컷뉴스',
            'mediatoday.co.kr': '미디어오늘',
            'mediaus.co.kr': '미디어스',
            'slownews.kr': '슬로우뉴스',
            'tf.co.kr': '더팩트',
            'wikitree.co.kr': '위키트리',
            'dailian.co.kr': '데일리안',
            'newstapa.org': '뉴스타파',
            'bloter.net': '블로터',
            'it.chosun.com': 'IT조선',
            'ciokorea.com': 'CIO코리아',
            'venturesquare.net': '벤처스퀘어',
            'economist.co.kr': '이코노미스트(코리아)',
            'jmagazine.joins.com/forbes': '포브스코리아',
            'hankyung.com/magazine': '한경비즈니스',
            'mkeconomy.mk.co.kr': '매경이코노미',
            'sports.chosun.com': '스포츠조선',
            'sportsseoul.com': '스포츠서울',
            'isplus.com': '일간스포츠',
            'osen.co.kr': 'OSEN',
            'mydaily.co.kr': '마이데일리',
            'xportsnews.com': '엑스포츠뉴스',
            'sportivemedia.co.kr': '스포티비뉴스',
            'kyeongin.com': '경인일보',
            'incheonilbo.com': '인천일보',
            'kgilbo.com': '경기일보',
            'joongboo.com': '중부일보',
            'busan.com': '부산일보',
            'kookje.co.kr': '국제신문',
            'idomin.com': '경남도민일보',
            'knnews.co.kr': '경남신문',
            'gnnews.co.kr': '경남일보',
            'ulsanmaeil.com': '울산매일',
            'imaeil.com': '매일신문',
            'yeongnam.com': '영남일보',
            'kyongbuk.co.kr': '경북일보',
            'hidomin.com': '경북도민일보',
            'daejonilbo.com': '대전일보',
            'cctoday.co.kr': '충청투데이',
            'joongdo.co.kr': '중도일보',
            'cbnews.co.kr': '충북일보',
            'ccdailynews.com': '충청일보',
            'kwangju.co.kr': '광주일보',
            'jnilbo.com': '전남일보',
            'mudeungilbo.com': '무등일보',
            'jjan.kr': '전북일보',
            'domin.co.kr': '전북도민일보',
            'kado.net': '강원도민일보',
            'kwnews.co.kr': '강원일보',
            'jemin.com': '제민일보',
            'hallailbo.co.kr': '한라일보',
            'khgames.co.kr': '경향게임스',
            'cine21.com': '씨네21',
            'womennews.co.kr': '여성신문',
            'h21.hani.co.kr': '한겨레21',
            'shindonga.donga.com': '신동아',
            'monthly.chosun.com': '월간조선',
            'weekly.donga.com': '주간동아',
            'weekly.chosun.com': '주간조선',
            # 추가 도메인 매핑
            'kr.aving.net': '에이빙',
            'epnc.co.kr': '테크월드뉴스',
            'platum.kr': '플래텀',
            'itooza.com': '아이투자',
            'sisajournal-e.com': '시사저널',
            'widedaily.com': '와이드경제',
            'econovill.com': '이코노믹리뷰',
            'itdaily.kr': '아이티데일리',
            'biotimes.co.kr': '바이오타임즈',
            'yakup.com': '약업신문',
            'cstimes.com': '컨슈머타임즈',
            'koit.co.kr': '정보통신신문',
            'fntimes.com': '한국금융',
            'enewstoday.co.kr': '이뉴스투데이',
            'enetnews.co.kr': '이넷뉴스',
            # 추가 언론기관 매핑
            'healthinnews.co.kr': '헬스인뉴스',
            'it-b.co.kr': '아이티비즈',
            'womentimes.co.kr': '우먼타임즈',
            'thebigdata.co.kr': '빅데이터뉴스',
            'discoverynews.kr': '디스커버리뉴스',
            'medigatenews.com': '미디게이트뉴스',
            'rapportian.com': '라포르시안',
            'dealsite.co.kr': '딜사이트',
            'medisobizanews.com': '메디소비자뉴스',
            'pharmnews.com': '팜뉴스',
            'm-i.kr': '매일일보',
            # 추가 언론기관 매핑
            'sentv.co.kr': '서울경제TV',
            'dhnews.co.kr': '대학저널',
            'gosiweek.com': '피앤피뉴스',
            'gameshot.net': '게임샷',
            'aitimes.com': 'AI타임즈',
            'gamefocus.co.kr': '게임포커스',
            'the-stock.kr': '더스탁',
            'g-enews.com': '글로벌이코노믹',
            # 추가 언론기관 매핑
            'newslock.co.kr': '뉴스락',
            'dailypop.kr': '데일리팝',
            'businesspost.co.kr': '비즈니스포스트'
        }
    
    def _clear_cache_if_needed(self):
        """필요시 캐시를 클리어합니다."""
        current_time = time.time()
        if current_time - self._last_cache_clear > self._cache_clear_interval:
            print(f"[CACHE] Clearing session cache after {self._cache_clear_interval} seconds")
            self.session.cookies.clear()
            self.session.headers.clear()
            self.session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            })
            self._last_cache_clear = current_time
    
    def _create_fresh_session(self):
        """새로운 세션을 생성합니다."""
        print(f"[CACHE] Creating fresh session for new search")
        fresh_session = requests.Session()
        fresh_session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        })
        fresh_session.verify = False
        return fresh_session
    
    def _convert_domain_to_press_name(self, domain):
        """도메인을 언론사명으로 변환"""
        return self.domain_to_press.get(domain, domain)
    
    def _filter_news_by_period(self, news_items, start_date=None, end_date=None):
        """뉴스 아이템들을 기간별로 필터링"""
        if not start_date and not end_date:
            return news_items
        
        print(f"[PERIOD FILTER] Filtering {len(news_items)} news items")
        print(f"[PERIOD FILTER] start_date: {start_date}, end_date: {end_date}")
        
        filtered_items = []
        
        for item in news_items:
            item_date = item.get('published')
            if not item_date:
                continue
            
            # 날짜 파싱
            try:
                if isinstance(item_date, str):
                    # 문자열 날짜를 datetime으로 변환
                    parsed_date = self._parse_date_to_datetime(item_date)
                else:
                    parsed_date = item_date
                
                if not parsed_date:
                    continue
                
                # 시작일 필터링
                if start_date:
                    start_datetime = self._parse_date_to_datetime(start_date)
                    if start_datetime and parsed_date < start_datetime:
                        continue
                
                # 종료일 필터링
                if end_date:
                    end_datetime = self._parse_date_to_datetime(end_date)
                    if end_datetime and parsed_date > end_datetime:
                        continue
                
                filtered_items.append(item)
                
            except Exception as e:
                print(f"[PERIOD FILTER] Error parsing date '{item_date}': {e}")
                continue
        
        print(f"[PERIOD FILTER] Filtered to {len(filtered_items)} items")
        return filtered_items
    
    def _parse_date_to_datetime(self, date_str):
        """날짜 문자열을 datetime 객체로 변환"""
        if not date_str:
            return None
        
        try:
            # 이미 파싱된 날짜 형식인 경우 (YYYY-MM-DD HH:MM:SS)
            if isinstance(date_str, str) and len(date_str) == 19 and date_str[4] == '-' and date_str[7] == '-':
                from datetime import datetime
                return datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
            
            # 원본 날짜 문자열인 경우
            from dateutil import parser
            parsed_date = parser.parse(date_str)
            return parsed_date
        except Exception as e:
            print(f"[DATETIME_PARSE_ERROR] 날짜 변환 오류: {date_str}, 오류: {e}")
            return None
    
    def _extract_press_from_title(self, title):
        """제목에서 언론사명 추출 (구글 뉴스용)"""
        # 제목 끝에 "- 언론사명" 형태로 있는 경우 추출
        match = re.search(r' - ([^-]+)$', title)
        if match:
            return match.group(1).strip()
        
        # 제목에 언론사명이 포함된 경우 추출
        for press_name in self.domain_to_press.values():
            if press_name in title:
                return press_name
        
        return '알 수 없음'
    
    def _normalize_title(self, title):
        """제목을 정규화하여 중복 비교에 사용"""
        if not title:
            return ""
        
        # HTML 태그 제거
        title = re.sub(r'<[^>]+>', '', title)
        
        # 구글 뉴스의 "- 언론사" 부분 제거 (예: "제목 - 스타트업엔" -> "제목")
        title = re.sub(r'\s*-\s*[^-]+$', '', title)
        
        # 특수문자 및 공백 정규화
        title = re.sub(r'[^\w\s가-힣]', ' ', title)
        title = re.sub(r'\s+', ' ', title).strip()
        
        # 소문자 변환
        title = title.lower()
        
        return title
    
    def _remove_duplicates(self, news_items, threshold=0.5):
        """뉴스 아이템에서 중복 제거"""
        if not news_items:
            return [], 0
        
        threshold_percent = int(threshold * 100)
        print(f"[DEDUP] Starting duplicate removal with threshold: {threshold_percent}%")
        print(f"[DEDUP] Total items to process: {len(news_items)}")
        
        unique_news = []
        duplicates_removed = 0
        
        # threshold가 0이면 완전히 중복 제거 비활성화
        if threshold == 0:
            print(f"[DEDUP] Duplicate removal completely disabled (threshold: 0%)")
            print(f"[DEDUP] Returning all {len(news_items)} items without any filtering")
            return news_items, 0
        
        # 제목 + 언론사 조합으로 중복 확인
        seen_combinations = set()
        
        for item in news_items:
            title = item.get('title', '')
            source = item.get('source', '알 수 없음')
            normalized_title = self._normalize_title(title)
            
            if not normalized_title:
                # 제목이 없는 경우 그대로 추가
                unique_news.append(item)
                continue
            
            # 제목 + 언론사 조합 생성
            title_source_combo = f"{normalized_title}|{source}"
            
            # 정확한 제목+언론사 매칭 확인
            if title_source_combo in seen_combinations:
                duplicates_removed += 1
                print(f"[DEDUP] Exact duplicate removed (same title and source): {title[:50]}... ({source})")
                continue
            
            # 유사한 제목 확인 (threshold 기반, 같은 언론사만 비교)
            is_duplicate = False
            for existing_combo in seen_combinations:
                existing_title, existing_source = existing_combo.split('|', 1)
                
                # 같은 언론사인 경우에만 유사도 비교
                if source == existing_source:
                    similarity = self._calculate_similarity(normalized_title, existing_title)
                    if similarity >= threshold:
                        duplicates_removed += 1
                        similarity_percent = int(similarity * 100)
                        print(f"[DEDUP] Similar duplicate removed (similarity: {similarity_percent}%, same source): {title[:50]}... ({source})")
                        is_duplicate = True
                        break
            
            if not is_duplicate:
                seen_combinations.add(title_source_combo)
                unique_news.append(item)
        
        print(f"[DEDUP] Duplicate removal completed:")
        print(f"[DEDUP] - Original items: {len(news_items)}")
        print(f"[DEDUP] - Duplicates removed: {duplicates_removed}")
        print(f"[DEDUP] - Unique items: {len(unique_news)}")
        
        return unique_news, duplicates_removed
    
    def _calculate_similarity(self, title1, title2):
        """두 제목 간의 유사도 계산 (0.0 ~ 1.0)"""
        if not title1 or not title2:
            return 0.0
        
        # 단어 기반 유사도 계산
        words1 = set(title1.split())
        words2 = set(title2.split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        if not union:
            return 0.0
        
        return len(intersection) / len(union)
    
    def _parse_date(self, date_str):
        """날짜 문자열을 파싱하여 표준 형식으로 변환"""
        if not date_str:
            return None
        
        try:
            # 네이버 API의 잘못된 연도 문제 수정
            # "Sun, 17 Aug 2025 10:00:00 +0900" -> "Sun, 17 Aug 2024 10:00:00 +0900"
            if '2025' in date_str and 'Aug' in date_str:
                # 2025년 8월은 실제로 2024년 8월일 가능성이 높음
                date_str = date_str.replace('2025', '2024')
                print(f"[DATE_FIX] 날짜 수정: {date_str}")
            
            # 다양한 날짜 형식 처리
            from dateutil import parser
            parsed_date = parser.parse(date_str)
            
            # timezone 정보 제거하여 naive datetime으로 변환
            if parsed_date.tzinfo is not None:
                parsed_date = parsed_date.replace(tzinfo=None)
            
            # 현재 날짜보다 미래인 경우 현재 날짜로 조정
            from datetime import datetime
            current_date = datetime.now()
            if parsed_date > current_date:
                # 연도를 현재 연도로 조정
                corrected_date = parsed_date.replace(year=current_date.year)
                print(f"[DATE_FIX] 미래 날짜 수정: {parsed_date} -> {corrected_date}")
                parsed_date = corrected_date
            
            return parsed_date.strftime('%Y-%m-%d %H:%M:%S')
        except Exception as e:
            print(f"[DATE_PARSE_ERROR] 날짜 파싱 오류: {date_str}, 오류: {e}")
            return date_str
    
    def search_naver_news(self, query, display=100, max_results=1000, title_filter=True, session=None):
        """네이버 뉴스 검색 (최대 1000개까지 가져오기)"""
        print(f"[NAVER] Searching for: '{query}' (max_results: {max_results})")
        
        # 정확한 검색을 위해 따옴표 추가
        exact_query = f'"{query}"'
        print(f"[NAVER] Using exact query: '{exact_query}'")
        
        headers = {
            'X-Naver-Client-Id': self.naver_client_id,
            'X-Naver-Client-Secret': self.naver_client_secret
        }
        
        all_items = []
        current_start = 1
        current_display = min(display, 100)  # 네이버 API 최대 display는 100
        
        while len(all_items) < max_results:
            params = {
                'query': exact_query,
                'display': current_display,
                'start': current_start,
                'sort': 'date',  # 최신순 정렬
                'filter': 'all'  # 모든 결과 포함 (중복 제거 없음)
            }
            
            print(f"[NAVER] Requesting items {current_start}-{current_start + current_display - 1} (display: {current_display})")
            
            try:
                # 세션이 제공되면 사용, 아니면 기본 세션 사용
                current_session = session if session else self.session
                response = current_session.get(self.naver_news_url, headers=headers, params=params, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                items = data.get('items', [])
                
                if not items:
                    print(f"[NAVER] No more items available at start={current_start}")
                    break
                
                # 검색 결과에 소스 정보 추가 및 정확한 검색어 필터링
                filtered_items = []
                for item in items:
                    title = item.get('title', '').lower()
                    description = item.get('description', '').lower()
                    
                    # 첫 번째 아이템의 description 길이 로깅
                    if len(filtered_items) == 0:
                        original_desc = item.get('description', '')
                        print(f"[NAVER DEBUG] 첫 번째 뉴스 description 길이: {len(original_desc)}자")
                        print(f"[NAVER DEBUG] description 내용: {original_desc[:200]}...")
                    
                    # 정확한 검색어 필터링 (설정에 따라 활성화/비활성화)
                    if not title_filter:
                        # 필터링 비활성화: 모든 결과 포함
                        include_item = True
                    else:
                        # 필터링 활성화: 정확한 검색어 매칭 확인
                        query_lower = query.lower()
                        
                        # 1. 제목에 정확한 검색어가 포함된 경우
                        title_match = query_lower in title
                        
                        # 2. 요약+본문에 정확한 검색어가 포함된 경우
                        content_match = query_lower in description
                        
                        include_item = title_match or content_match
                    
                    # 필터링 조건을 만족하는 경우에만 아이템 추가
                    if include_item:
                        # source 필드가 없으면 기본값 설정
                        if 'source' not in item:
                            item['source'] = '알 수 없음'
                        
                        # 네이버 언론사명 추출 (originallink에서)
                        originallink = item.get('originallink', '')
                        if originallink:
                            # URL에서 도메인 추출
                            domain_match = re.search(r'https?://(?:www\.)?([^/]+)', originallink)
                            if domain_match:
                                domain = domain_match.group(1)
                                # 도메인을 언론사명으로 변환
                                press_name = self._convert_domain_to_press_name(domain)
                                item['press_name'] = press_name
                                item['source'] = press_name  # source 필드도 설정
                            else:
                                item['press_name'] = '알 수 없음'
                                item['source'] = '알 수 없음'
                        else:
                            item['press_name'] = '알 수 없음'
                            item['source'] = '알 수 없음'
                        
                        # 링크 처리 (네이버 뉴스 링크 우선, 없으면 원본 링크 사용)
                        api_link = item.get('link', '')
                        
                        # link가 네이버 뉴스 링크인지 확인
                        if api_link and ('news.naver.com' in api_link or 'n.news.naver.com' in api_link):
                            # 네이버 뉴스 링크
                            item['link'] = api_link
                            item['originallink'] = originallink if originallink else api_link
                            item['link_type'] = 'naver'  # 링크 타입 표시
                            
                            if len(filtered_items) < 3:
                                print(f"[NAVER] ✓ 네이버 뉴스 링크: {api_link}")
                        else:
                            # 원본 링크 (언론사 직접 링크)
                            item['link'] = api_link
                            item['originallink'] = originallink if originallink else api_link
                            item['link_type'] = 'original'  # 링크 타입 표시
                            
                            if len(filtered_items) < 3:
                                print(f"[NAVER] ⚠ 원본 링크 (언론사 직접): {api_link[:80]}...")
                        
                        # 발행일 정규화
                        pub_date = item.get('pubDate', '')
                        if pub_date:
                            item['published'] = self._parse_date(pub_date)
                        
                        item['search_source'] = '네이버뉴스검색'
                        item['query'] = query
                        filtered_items.append(item)
                
                all_items.extend(filtered_items)
                if title_filter:
                    print(f"[NAVER] Retrieved {len(items)} items, filtered to {len(filtered_items)} exact keyword matches (total: {len(all_items)})")
                else:
                    print(f"[NAVER] Retrieved {len(items)} items, no keyword filtering applied (total: {len(all_items)})")
                
                # 다음 페이지로 이동
                current_start += current_display
                
                # 네이버 API 제한: start는 최대 1000
                if current_start > 1000:
                    print(f"[NAVER] Reached maximum start position (1000)")
                    break
                
                # API 호출 간격 조절 (네이버 API 제한 고려)
                time.sleep(0.1)
                
            except Exception as e:
                print(f"[NAVER] Error at start={current_start}: {e}")
                break
        
        print(f"[NAVER] Total items retrieved: {len(all_items)}")
        
        # 최신순으로 정렬 (날짜 기준 내림차순)
        try:
            from datetime import datetime
            all_items.sort(key=lambda x: datetime.strptime(x.get('published', '1900-01-01 00:00:00'), '%Y-%m-%d %H:%M:%S'), reverse=True)
            print(f"[NAVER] Items sorted by date (newest first)")
        except Exception as e:
            print(f"[NAVER] Error sorting by date: {e}")
        
        return all_items
        
    def search_google_news(self, query, session=None):
        """구글 뉴스 검색"""
        print(f"[GOOGLE] Searching for: '{query}'")
        
        try:
            # URL 인코딩
            encoded_query = quote(query, safe='', encoding='utf-8')
            url = f"https://news.google.com/rss/search?q={encoded_query}&hl=ko&gl=KR&ceid=KR:ko"
            
            print(f"[GOOGLE] URL: {url}")
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
            
            # 세션이 제공되면 사용, 아니면 기본 세션 사용
            current_session = session if session else self.session
            response = current_session.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            print(f"[GOOGLE] Response status: {response.status_code}")
            print(f"[GOOGLE] Response length: {len(response.content)}")
            
            # XML 파싱
            root = ET.fromstring(response.content)
            
            items = []
            seen_titles = set()  # RSS 레벨에서 중복 제목 체크용
            
            for item in root.findall('.//item'):
                try:
                    title = item.find('title').text if item.find('title') is not None else ''
                    link = item.find('link').text if item.find('link') is not None else ''
                    description = item.find('description').text if item.find('description') is not None else ''
                    pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''
                    
                    # RSS 레벨에서 중복 제목 체크
                    normalized_title = self._normalize_title(title)
                    if normalized_title in seen_titles:
                        print(f"[GOOGLE] Skipping duplicate title in RSS: {title[:50]}...")
                        continue
                    seen_titles.add(normalized_title)
                    
                    # 제목에서 언론사명 추출
                    press_name = self._extract_press_from_title(title)
                    
                    # source 필드가 비어있거나 '알 수 없음'인 경우 기본값 설정
                    if not press_name or press_name == '알 수 없음':
                        # 링크에서 도메인 추출 시도
                        domain_match = re.search(r'https?://(?:www\.)?([^/]+)', link)
                        if domain_match:
                            domain = domain_match.group(1)
                            press_name = self._convert_domain_to_press_name(domain)
                        else:
                            press_name = '알 수 없음'
                    
                    news_item = {
                        'title': title,
                        'link': link,
                        'description': description,
                        'published': self._parse_date(pub_date),
                        'press_name': press_name,
                        'source': press_name,  # source 필드도 설정
                        'search_source': '구글뉴스검색',
                        'query': query
                    }
                    
                    items.append(news_item)
                    
                except Exception as e:
                    print(f"[GOOGLE] Error parsing item: {e}")
                    continue
            
            print(f"[GOOGLE] Found {len(items)} items (after RSS-level deduplication)")
            return items
            
        except Exception as e:
            print(f"[GOOGLE] Error: {e}")
            return []

    def search_news(self, query, naver_enabled=True, google_enabled=True, duplicate_threshold=50, naver_title_filter=True):
        """기본 뉴스 검색 (네이버 + 구글)"""
        print(f"[SEARCH] Starting search for: '{query}'")
        print(f"[SEARCH] naver_enabled: {naver_enabled}, google_enabled: {google_enabled}")
        print(f"[SEARCH] duplicate_threshold: {duplicate_threshold}%")
        
        # 매번 새로운 세션 강제 생성 (캐시 방지)
        print(f"[CACHE] 강제로 새로운 세션 생성")
        fresh_session = self._create_fresh_session()
        
        all_news = []
        
        # 네이버 검색
        if naver_enabled:
            print(f"[SEARCH] Calling Naver search...")
            naver_items = self.search_naver_news(query, title_filter=naver_title_filter, session=fresh_session)
            all_news.extend(naver_items)
            print(f"[SEARCH] Naver results: {len(naver_items)}")
        
        # 구글 검색
        if google_enabled:
            print(f"[SEARCH] Calling Google search...")
            google_items = self.search_google_news(query, session=fresh_session)
            all_news.extend(google_items)
            print(f"[SEARCH] Google results: {len(google_items)}")
        
        print(f"[SEARCH] Total results: {len(all_news)}")
        
        # 중복 제거 수행 (0%면 완전히 중복 제거 비활성화)
        if duplicate_threshold == 0:
            unique_news = all_news
            duplicates_removed = 0
            print(f"[SEARCH] Duplicate removal completely disabled (threshold: 0%)")
            print(f"[SEARCH] All {len(all_news)} items preserved without any filtering")
        else:
            # 0-100 범위를 0.0-1.0 범위로 변환
            threshold_ratio = duplicate_threshold / 100.0
            unique_news, duplicates_removed = self._remove_duplicates(all_news, threshold_ratio)
        
        print(f"[SEARCH] Duplicates removed: {duplicates_removed}")
        print(f"[SEARCH] Final unique results: {len(unique_news)}")
        
        # 딕셔너리 형태로 반환 (전체 본문은 엑셀/AI 분석 시 가져옴)
        return {
            'news': unique_news,
            'total_before_dedup': len(all_news),
            'duplicates_removed': duplicates_removed,
            'total_after_dedup': len(unique_news),
            'period_filtered': 0  # 기본 검색에서는 기간 필터링 없음
        }

    def search_news_by_period(self, query, start_date=None, end_date=None, limit=None, condition='exact', duplicate_threshold=50, naver_enabled=True, google_enabled=True, naver_title_filter=True, **kwargs):
        """기간별 뉴스 검색 (기간 필터링 포함)"""
        print(f"[PERIOD SEARCH] Starting period search for: '{query}'")
        print(f"[PERIOD SEARCH] start_date: {start_date}, end_date: {end_date}")
        print(f"[PERIOD SEARCH] naver_enabled: {naver_enabled}, google_enabled: {google_enabled}")
        print(f"[PERIOD SEARCH] condition: {condition}, duplicate_threshold: {duplicate_threshold}%")
        
        # 기본 검색 수행
        search_results = self.search_news(query, naver_enabled=naver_enabled, google_enabled=google_enabled, duplicate_threshold=duplicate_threshold, naver_title_filter=naver_title_filter)
        
        # 기간 필터링 적용
        if start_date or end_date:
            before_period_filter = len(search_results['news'])
            filtered_news = self._filter_news_by_period(search_results['news'], start_date, end_date)
            after_period_filter = len(filtered_news)
            period_filtered_count = before_period_filter - after_period_filter
            
            search_results['news'] = filtered_news
            search_results['total_after_dedup'] = len(filtered_news)
            print(f"[PERIOD SEARCH] After period filtering: {len(filtered_news)} items (removed {period_filtered_count} items outside date range)")
            
            # 기간 필터링 정보를 별도로 저장
            search_results['period_filtered'] = period_filtered_count
            print(f"[PERIOD SEARCH] Period filtering removed {period_filtered_count} items")
        
        print(f"[PERIOD SEARCH] Search completed, results: {search_results}")
        
        # 결과 반환
        return search_results
    
    def _fetch_full_content_for_news(self, news_items):
        """뉴스 목록에 대해 전체 본문 가져오기"""
        from bs4 import BeautifulSoup
        
        for i, news in enumerate(news_items):
            link = news.get('link', '')
            description = news.get('description', '')
            
            if not link:
                continue
            
            try:
                print(f"[FETCH] 뉴스 {i+1}/{len(news_items)} 전체 본문 가져오기: {link[:80]}...")
                
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
                
                response = requests.get(link, headers=headers, timeout=10)
                response.raise_for_status()
                response.encoding = response.apparent_encoding
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # 불필요한 요소 제거
                for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'iframe']):
                    element.decompose()
                
                # 본문 추출 선택자
                content_selectors = [
                    '#articleBody', '.article_body', '.article-content',
                    '.news_end', '.article_body_wrp .end_body_wrp',
                    'article', '.article-content', '.news-content', '.content',
                    '.post-content', '.entry-content', '.story-content',
                    '.article-body', '.news-body', '.story-body'
                ]
                
                content = ""
                for selector in content_selectors:
                    elements = soup.select(selector)
                    if elements:
                        texts = []
                        for elem in elements:
                            text = elem.get_text().strip()
                            if len(text) > 50:
                                texts.append(text)
                        content = ' '.join(texts)
                        if len(content) > 300:
                            break
                
                # 본문을 찾지 못한 경우 p 태그에서 추출
                if not content or len(content) < 300:
                    paragraphs = soup.find_all('p')
                    texts = []
                    for p in paragraphs:
                        text = p.get_text().strip()
                        if len(text) > 30:
                            texts.append(text)
                    content = ' '.join(texts)
                
                # 텍스트 정리
                if content:
                    content = re.sub(r'\s+', ' ', content)
                    content = content.strip()
                    
                    if len(content) > 30000:
                        content = content[:30000]
                    
                    if len(content) > len(description):
                        news['description'] = content
                        print(f"[FETCH] ✓ 전체 본문 사용: {len(content)}자 (원본: {len(description)}자)")
                    else:
                        print(f"[FETCH] ✗ 본문이 짧아 원본 사용: {len(content)}자")
                else:
                    print(f"[FETCH] ✗ 본문 추출 실패, 원본 사용")
                    
            except Exception as e:
                print(f"[FETCH] ✗ 뉴스 {i+1} 본문 가져오기 실패: {str(e)}")
                continue
        
        return news_items
