import requests
import feedparser
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import pytz
import re
from urllib.parse import urljoin, urlparse, quote
import time
import random
import json
import xml.etree.ElementTree as ET
from dateutil import parser as date_parser

class NewsService:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
        # SSL 검증 비활성화 (연합뉴스 SSL 문제 해결)
        self.session.verify = False
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        # 네이버 뉴스 API 설정
        self.naver_news_url = "https://openapi.naver.com/v1/search/news.json"
        self.naver_client_id = "htCujKMCJaJ4pgTxpITY"
        self.naver_client_secret = "PjZL2dIzf3"
        
        # 구글 뉴스 URL (한글 검색 지원)
        self.google_news_url = "https://news.google.com/rss/search?q={query}&hl=ko&gl=KR&ceid=KR:ko"
        
        # RSS 소스 정의 (새로운 URL로 변경)
        self.rss_sources = {
            'etnews': {
                'name': '전자신문',
                'url': 'http://rss.etnews.com/03.xml',
                'enabled': True
            },
            'mk': {
                'name': '매일경제',
                'url': 'https://www.mk.co.kr/rss/40300001/',
                'enabled': True
            },
            'chosun': {
                'name': '조선일보',
                'url': 'https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml',
                'enabled': True
            },
            'donga': {
                'name': '동아일보',
                'url': 'https://rss.donga.com/total.xml',
                'enabled': True
            },
            'khan': {
                'name': '경향신문',
                'url': 'https://www.khan.co.kr/rss/rssdata/total_news.xml',
                'enabled': True
            },

            'hankyoreh': {
                'name': '한겨레',
                'url': 'https://www.hani.co.kr/rss/',
                'enabled': True
            }
        }
        
        # 검색 진행 상황 추적
        self.current_source = ''
        self.total_sources = 0
        self.completed_sources = 0
        self.status = 'idle'

    def get_latest_news(self, limit=None):
        """최신 뉴스를 가져옵니다."""
        all_news = []
        
        for source_id, source_info in self.rss_sources.items():
            if not source_info['enabled']:
                continue
                
            try:
                news_items = self._fetch_rss_news(source_info['url'], source_info['name'])
                all_news.extend(news_items)
                print(f"Fetched {len(news_items)} news from {source_info['name']}")
            except Exception as e:
                print(f"Error fetching from {source_info['name']}: {e}")
                continue
        
        # 발행 시간 기준으로 정렬
        all_news.sort(key=lambda x: self.parse_date(x.get('published', '')) or datetime.min.replace(tzinfo=pytz.UTC), reverse=True)
        
        return all_news[:limit] if limit else all_news

    def get_news_by_period(self, start_date=None, end_date=None, limit=None):
        """기간별 뉴스를 가져옵니다."""
        from datetime import datetime, date
        
        # 기본값 설정: 2023년 1월 1일부터 현재까지
        if start_date is None:
            start_date = datetime(2023, 1, 1, tzinfo=pytz.UTC)
        elif isinstance(start_date, str):
            start_date = self.parse_date(start_date) or datetime(2023, 1, 1, tzinfo=pytz.UTC)
        
        if end_date is None:
            end_date = datetime.now(pytz.UTC)
        elif isinstance(end_date, str):
            end_date = self.parse_date(end_date) or datetime.now(pytz.UTC)
        
        all_news = []
        
        for source_id, source_info in self.rss_sources.items():
            if not source_info['enabled']:
                continue
                
            try:
                news_items = self._fetch_rss_news(source_info['url'], source_info['name'])
                
                # 기간 필터링
                filtered_news = []
                for news in news_items:
                    news_date = self.parse_date(news.get('published', ''))
                    if news_date and start_date <= news_date <= end_date:
                        filtered_news.append(news)
                
                all_news.extend(filtered_news)
                print(f"Fetched {len(filtered_news)} news from {source_info['name']} (period: {start_date.date()} ~ {end_date.date()})")
            except Exception as e:
                print(f"Error fetching from {source_info['name']}: {e}")
                continue
        
        # 발행 시간 기준으로 정렬
        all_news.sort(key=lambda x: self.parse_date(x.get('published', '')) or datetime.min.replace(tzinfo=pytz.UTC), reverse=True)
        
        return all_news[:limit] if limit else all_news

    def search_news_by_period(self, query, start_date=None, end_date=None, limit=None, condition='exact', duplicate_threshold=0.5, **kwargs):
        """기간별 뉴스 검색을 수행합니다."""
        from datetime import datetime
        
        # 기본값 설정: 2023년 1월 1일부터 현재까지
        if start_date is None:
            start_date = datetime(2023, 1, 1, tzinfo=pytz.UTC)
        elif isinstance(start_date, str):
            start_date = self.parse_date(start_date) or datetime(2023, 1, 1, tzinfo=pytz.UTC)
        
        if end_date is None:
            end_date = datetime.now(pytz.UTC)
        elif isinstance(end_date, str):
            end_date = self.parse_date(end_date) or datetime.now(pytz.UTC)
        
        print(f"Period search - Query: {query}")
        print(f"Period search - Start date: {start_date}")
        print(f"Period search - End date: {end_date}")
        
        # 1단계: 네이버/구글 검색 수행
        print(f"[PERIOD SEARCH] Starting search_news with query: '{query}'")
        print(f"[PERIOD SEARCH] naver_enabled: {kwargs.get('naver_enabled', True)}")
        print(f"[PERIOD SEARCH] google_enabled: {kwargs.get('google_enabled', True)}")
        print(f"[PERIOD SEARCH] About to call search_news function...")
        
        try:
            search_results = self.search_news(
                query=query,
                condition=condition,
                naver_enabled=kwargs.get('naver_enabled', True),
                google_enabled=kwargs.get('google_enabled', True),
                duplicate_threshold=duplicate_threshold
            )
            print(f"[PERIOD SEARCH] search_news function completed successfully")
            print(f"[PERIOD SEARCH] search_results type: {type(search_results)}")
            if isinstance(search_results, dict):
                print(f"[PERIOD SEARCH] search_results keys: {list(search_results.keys())}")
        except Exception as e:
            print(f"[PERIOD SEARCH] Error calling search_news: {e}")
            import traceback
            traceback.print_exc()
            search_results = []
        
        # search_news가 딕셔너리를 반환하는 경우 뉴스 리스트만 추출
        print(f"[PERIOD SEARCH] search_results type: {type(search_results)}")
        print(f"[PERIOD SEARCH] search_results content: {search_results}")
        
        if isinstance(search_results, dict):
            news_list = search_results['news']
            print(f"[PERIOD SEARCH] Extracted news_list from dict: {len(news_list)} items")
        else:
            news_list = search_results
            print(f"[PERIOD SEARCH] Using search_results directly as list: {len(news_list)} items")
        
        print(f"Period search - API search results: {len(news_list)}")
        
        # 2단계: RSS 피드에서 검색어와 일치하는 뉴스 수집 (기간별 검색 시 추가)
        rss_news_list = []
        try:
            print("Period search - Collecting RSS feeds for better coverage...")
            for source_id, source_info in self.rss_sources.items():
                try:
                    rss_items = self._fetch_rss_news(source_info['url'], source_info['name'])
                    
                    # 검색어와 일치하는 뉴스만 필터링
                    for item in rss_items:
                        title = item.get('title', '').lower()
                        description = item.get('description', '').lower()
                        content = f"{title} {description}"
                        
                        # 검색어가 제목이나 설명에 포함되어 있는지 확인
                        if query.lower() in content:
                            # RSS 소스 정보 추가
                            item['search_source'] = f'RSS({source_info["name"]})'
                            item['query'] = query
                            rss_news_list.append(item)
                            
                except Exception as e:
                    print(f"Error fetching RSS from {source_info['name']}: {e}")
                    continue
            
            print(f"Period search - RSS search results: {len(rss_news_list)}")
            
            # RSS 뉴스를 기존 뉴스 리스트에 추가
            news_list.extend(rss_news_list)
            print(f"Period search - Combined results: {len(news_list)}")
            
        except Exception as e:
            print(f"Error in RSS collection: {e}")
        
        # 3단계: 기간 필터링
        filtered_results = []
        for news in news_list:
            news_date = self.parse_date(news.get('published', ''))
            if news_date and start_date <= news_date <= end_date:
                filtered_results.append(news)
        
        print(f"Period search - Filtered results: {len(filtered_results)}")
        
        # 4단계: 중복 제거 (RSS와 API 결과 간 중복 제거)
        unique_results = []
        seen_titles = set()
        duplicate_count = 0
        
        for news in filtered_results:
            title = news.get('title', '').strip()
            if title and title not in seen_titles:
                seen_titles.add(title)
                unique_results.append(news)
            else:
                duplicate_count += 1
        
        print(f"Period search - Unique results after deduplication: {len(unique_results)}")
        print(f"Period search - Duplicates removed: {duplicate_count}")
        
        # 5단계: 발행 시간 기준으로 정렬
        unique_results.sort(key=lambda x: self.parse_date(x.get('published', '')) or datetime.min.replace(tzinfo=pytz.UTC), reverse=True)
        
        # 최종 결과에 limit 적용
        final_results = unique_results[:limit] if limit else unique_results
        
        # 중복제거 정보를 포함한 딕셔너리 반환
        return {
            'news': final_results,
            'total_before_dedup': len(filtered_results),
            'duplicates_removed': duplicate_count,
            'total_after_dedup': len(final_results)
        }

    def extract_source_name_from_domain(self, domain):
        """도메인에서 언론기관명을 추출합니다"""
        if 'chosun.com' in domain:
            return '조선일보'
        elif 'donga.com' in domain:
            return '동아일보'
        elif 'joongang.co.kr' in domain:
            return '중앙일보'
        elif 'khan.co.kr' in domain:
            return '경향신문'
        elif 'hani.co.kr' in domain:
            return '한겨레'
        elif 'yonhapnews.co.kr' in domain or 'yna.co.kr' in domain:
            return '연합뉴스'
        elif 'newsis.com' in domain:
            return '뉴시스'
        elif 'mk.co.kr' in domain:
            return '매일경제'
        elif 'hankyung.com' in domain:
            return '한국경제'
        elif 'herald.co.kr' in domain:
            return '헤럴드경제'
        elif 'mt.co.kr' in domain:
            return '머니투데이'
        elif 'edaily.co.kr' in domain:
            return '이데일리'
        elif 'etnews.com' in domain:
            return '전자신문'
        elif 'zdnet.co.kr' in domain:
            return '지디넷코리아'
        elif 'boannews.com' in domain:
            return '보안뉴스'
        elif 'kbs.co.kr' in domain:
            return 'KBS'
        elif 'mbc.co.kr' in domain:
            return 'MBC'
        elif 'sbs.co.kr' in domain:
            return 'SBS'
        elif 'jtbc.co.kr' in domain:
            return 'JTBC'
        elif 'ytn.co.kr' in domain:
            return 'YTN'
        elif 'nocutnews.co.kr' in domain:
            return '노컷뉴스'
        elif 'ohmynews.com' in domain:
            return '오마이뉴스'
        elif 'pressian.com' in domain:
            return '프레시안'
        elif 'mediatoday.co.kr' in domain:
            return '미디어오늘'
        else:
            # 도메인에서 기본 이름 추출
            domain_parts = domain.split('.')
            if len(domain_parts) >= 2:
                return domain_parts[-2].upper()
            return '기타언론'

    def search_naver_news(self, query, display=100, start=1, sort='date', max_records=1000):
        """네이버 뉴스 API를 사용하여 뉴스를 검색합니다 (모든 결과 수집)"""
        try:
            print(f"Searching Naver News API for: {query} (날짜순)")
            
            # 첫 번째 API 호출로 총 검색 결과 수 확인
            initial_params = {
                'query': query,
                'display': 1,  # 최소한의 결과만 가져와서 total 확인
                'start': 1,
                'sort': 'date'
            }
            
            headers = {
                'X-Naver-Client-Id': self.naver_client_id,
                'X-Naver-Client-Secret': self.naver_client_secret,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            # 첫 번째 호출로 총 결과 수 확인
            response = self.session.get(self.naver_news_url, params=initial_params, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            total_count = data.get('total', 0)
            print(f"Naver API total results: {total_count}")
            
            # 최대 수집할 개수 결정 (API 제한: 최대 1000개)
            max_to_collect = min(total_count, max_records, 1000)
            
            if max_to_collect == 0:
                print("No results found")
                return []
            
            # 첫 번째 배치 수집 (display=100으로 최대한 가져오기)
            first_batch_params = {
                'query': query,
                'display': min(display, 100),  # 최대 100개
                'start': 1,
                'sort': 'date'
            }
            
            response = self.session.get(self.naver_news_url, params=first_batch_params, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            all_items = []
            
            # 첫 번째 배치 처리
            for item in data.get('items', []):
                news_item = self._parse_naver_news_item(item, query)
                all_items.append(news_item)
            
            print(f"First batch: {len(all_items)} items collected")
            
            # 추가 배치 수집 (필요한 경우)
            if max_to_collect > len(all_items):
                remaining_count = max_to_collect - len(all_items)
                batch_size = 100  # API 최대값
                
                # 추가 배치 수 계산
                additional_batches = (remaining_count + batch_size - 1) // batch_size
                
                for batch_num in range(1, additional_batches + 1):
                    start_pos = 1 + (batch_num * batch_size)
                    
                    # API 제한 확인 (start 최대 1000)
                    if start_pos > 1000:
                        print(f"Reached API limit (start > 1000), stopping at {len(all_items)} items")
                        break
                    
                    batch_params = {
                        'query': query,
                        'display': batch_size,
                        'start': start_pos,
                        'sort': 'date'
                    }
                    
                    print(f"Collecting batch {batch_num + 1}: start={start_pos}, display={batch_size}")
                    
                    try:
                        response = self.session.get(self.naver_news_url, params=batch_params, headers=headers, timeout=15)
                        response.raise_for_status()
                        data = response.json()
                        
                        batch_items = data.get('items', [])
                        if not batch_items:
                            print(f"No more items in batch {batch_num + 1}")
                            break
                        
                        for item in batch_items:
                            news_item = self._parse_naver_news_item(item, query)
                            all_items.append(news_item)
                        
                        print(f"Batch {batch_num + 1}: {len(batch_items)} items added, total: {len(all_items)}")
                        
                        # API 호출 간격 조절 (rate limiting 방지)
                        import time
                        time.sleep(0.1)
                        
                    except Exception as e:
                        print(f"Error collecting batch {batch_num + 1}: {e}")
                        break
            
            print(f"Total collected: {len(all_items)} news items from Naver API for query: {query}")
            return all_items
            
        except requests.exceptions.RequestException as e:
            print(f"Network error searching Naver News for '{query}': {e}")
            return []
        except json.JSONDecodeError as e:
            print(f"JSON parsing error for Naver News response: {e}")
            return []
        except Exception as e:
            print(f"Error searching Naver News for '{query}': {e}")
            return []

    def _normalize_title(self, title):
        """제목을 정규화하여 중복 제거에 사용합니다"""
        import re
        
        # 1. HTML 태그 제거
        title = self._clean_text(title)
        
        # 2. 제목 마지막의 "(언론사)" 부분 제거
        # 다양한 패턴의 언론사 표기 제거
        title = re.sub(r'\s*\([^)]*뉴스[^)]*\)\s*$', '', title)  # (XX뉴스)
        title = re.sub(r'\s*\([^)]*신문[^)]*\)\s*$', '', title)  # (XX신문)
        title = re.sub(r'\s*\([^)]*일보[^)]*\)\s*$', '', title)  # (XX일보)
        title = re.sub(r'\s*\([^)]*경제[^)]*\)\s*$', '', title)  # (XX경제)
        title = re.sub(r'\s*\([^)]*방송[^)]*\)\s*$', '', title)  # (XX방송)
        title = re.sub(r'\s*\([^)]*통신[^)]*\)\s*$', '', title)  # (XX통신)
        title = re.sub(r'\s*\([^)]*미디어[^)]*\)\s*$', '', title)  # (XX미디어)
        title = re.sub(r'\s*\([^)]*타임즈[^)]*\)\s*$', '', title)  # (XX타임즈)
        title = re.sub(r'\s*\([^)]*포스트[^)]*\)\s*$', '', title)  # (XX포스트)
        title = re.sub(r'\s*\([^)]*헤럴드[^)]*\)\s*$', '', title)  # (XX헤럴드)
        title = re.sub(r'\s*\([^)]*조선[^)]*\)\s*$', '', title)  # (XX조선)
        title = re.sub(r'\s*\([^)]*동아[^)]*\)\s*$', '', title)  # (XX동아)
        title = re.sub(r'\s*\([^)]*중앙[^)]*\)\s*$', '', title)  # (XX중앙)
        title = re.sub(r'\s*\([^)]*한국[^)]*\)\s*$', '', title)  # (XX한국)
        title = re.sub(r'\s*\([^)]*매일[^)]*\)\s*$', '', title)  # (XX매일)
        title = re.sub(r'\s*\([^)]*경향[^)]*\)\s*$', '', title)  # (XX경향)
        title = re.sub(r'\s*\([^)]*한겨레[^)]*\)\s*$', '', title)  # (XX한겨레)
        title = re.sub(r'\s*\([^)]*연합[^)]*\)\s*$', '', title)  # (XX연합)
        title = re.sub(r'\s*\([^)]*뉴시스[^)]*\)\s*$', '', title)  # (XX뉴시스)
        title = re.sub(r'\s*\([^)]*이데일리[^)]*\)\s*$', '', title)  # (XX이데일리)
        title = re.sub(r'\s*\([^)]*머니투데이[^)]*\)\s*$', '', title)  # (XX머니투데이)
        title = re.sub(r'\s*\([^)]*전자신문[^)]*\)\s*$', '', title)  # (XX전자신문)
        title = re.sub(r'\s*\([^)]*지디넷[^)]*\)\s*$', '', title)  # (XX지디넷)
        title = re.sub(r'\s*\([^)]*보안뉴스[^)]*\)\s*$', '', title)  # (XX보안뉴스)
        title = re.sub(r'\s*\([^)]*KBS[^)]*\)\s*$', '', title)  # (XXKBS)
        title = re.sub(r'\s*\([^)]*MBC[^)]*\)\s*$', '', title)  # (XXMBC)
        title = re.sub(r'\s*\([^)]*SBS[^)]*\)\s*$', '', title)  # (XXSBS)
        title = re.sub(r'\s*\([^)]*JTBC[^)]*\)\s*$', '', title)  # (XXJTBC)
        title = re.sub(r'\s*\([^)]*YTN[^)]*\)\s*$', '', title)  # (XXYTN)
        title = re.sub(r'\s*\([^)]*노컷뉴스[^)]*\)\s*$', '', title)  # (XX노컷뉴스)
        title = re.sub(r'\s*\([^)]*오마이뉴스[^)]*\)\s*$', '', title)  # (XX오마이뉴스)
        title = re.sub(r'\s*\([^)]*프레시안[^)]*\)\s*$', '', title)  # (XX프레시안)
        title = re.sub(r'\s*\([^)]*미디어오늘[^)]*\)\s*$', '', title)  # (XX미디어오늘)
        title = re.sub(r'\s*\([^)]*VENTURESQUARE[^)]*\)\s*$', '', title)  # (XXVENTURESQUARE)
        title = re.sub(r'\s*\([^)]*PLATUM[^)]*\)\s*$', '', title)  # (XXPLATUM)
        title = re.sub(r'\s*\([^)]*NEWS1[^)]*\)\s*$', '', title)  # (XXNEWS1)
        title = re.sub(r'\s*\([^)]*SEOULFN[^)]*\)\s*$', '', title)  # (XXSEOULFN)
        title = re.sub(r'\s*\([^)]*BREAKNEWS[^)]*\)\s*$', '', title)  # (XXBREAKNEWS)
        
        # 일반적인 언론사 패턴 (괄호 안에 2-15글자 언론사명)
        title = re.sub(r'\s*\([^)]{2,15}\)\s*$', '', title)
        
        # 3. 쉼표 정규화 (쉼표 제거)
        title = re.sub(r'\s*,\s*', ' ', title)
        
        # 4. 특수문자 정규화
        # 중점(·)과 중점(‧)을 동일하게 처리
        title = title.replace('‧', '·')
        
        # 5. 공백 정규화 (연속된 공백을 하나로)
        title = re.sub(r'\s+', ' ', title)
        
        # 6. 문장부호 정규화
        # 따옴표 정규화
        title = re.sub(r'["""'']', '"', title)
        
        # 7. 문장 끝 표현 정규화
        # "한다", "한다", "키운다" 등을 제거
        title = re.sub(r'\s*(한다|한다|키운다|양성한다?)\s*$', '', title)
        
        # 8. 앞뒤 공백 제거
        title = title.strip()
        
        return title

    def _remove_source_from_title(self, title):
        """제목에서 (언론사) 부분만 제거합니다"""
        import re
        
        # HTML 태그 제거
        title = self._clean_text(title)
        
        # 제목 마지막의 "(언론사)" 부분 제거
        # 다양한 패턴의 언론사 표기 제거
        title = re.sub(r'\s*\([^)]*뉴스[^)]*\)\s*$', '', title)  # (XX뉴스)
        title = re.sub(r'\s*\([^)]*신문[^)]*\)\s*$', '', title)  # (XX신문)
        title = re.sub(r'\s*\([^)]*일보[^)]*\)\s*$', '', title)  # (XX일보)
        title = re.sub(r'\s*\([^)]*경제[^)]*\)\s*$', '', title)  # (XX경제)
        title = re.sub(r'\s*\([^)]*방송[^)]*\)\s*$', '', title)  # (XX방송)
        title = re.sub(r'\s*\([^)]*통신[^)]*\)\s*$', '', title)  # (XX통신)
        title = re.sub(r'\s*\([^)]*미디어[^)]*\)\s*$', '', title)  # (XX미디어)
        title = re.sub(r'\s*\([^)]*타임즈[^)]*\)\s*$', '', title)  # (XX타임즈)
        title = re.sub(r'\s*\([^)]*포스트[^)]*\)\s*$', '', title)  # (XX포스트)
        title = re.sub(r'\s*\([^)]*헤럴드[^)]*\)\s*$', '', title)  # (XX헤럴드)
        title = re.sub(r'\s*\([^)]*조선[^)]*\)\s*$', '', title)  # (XX조선)
        title = re.sub(r'\s*\([^)]*동아[^)]*\)\s*$', '', title)  # (XX동아)
        title = re.sub(r'\s*\([^)]*중앙[^)]*\)\s*$', '', title)  # (XX중앙)
        title = re.sub(r'\s*\([^)]*한국[^)]*\)\s*$', '', title)  # (XX한국)
        title = re.sub(r'\s*\([^)]*매일[^)]*\)\s*$', '', title)  # (XX매일)
        title = re.sub(r'\s*\([^)]*경향[^)]*\)\s*$', '', title)  # (XX경향)
        title = re.sub(r'\s*\([^)]*한겨레[^)]*\)\s*$', '', title)  # (XX한겨레)
        title = re.sub(r'\s*\([^)]*연합[^)]*\)\s*$', '', title)  # (XX연합)
        title = re.sub(r'\s*\([^)]*뉴시스[^)]*\)\s*$', '', title)  # (XX뉴시스)
        title = re.sub(r'\s*\([^)]*이데일리[^)]*\)\s*$', '', title)  # (XX이데일리)
        title = re.sub(r'\s*\([^)]*머니투데이[^)]*\)\s*$', '', title)  # (XX머니투데이)
        title = re.sub(r'\s*\([^)]*전자신문[^)]*\)\s*$', '', title)  # (XX전자신문)
        title = re.sub(r'\s*\([^)]*지디넷[^)]*\)\s*$', '', title)  # (XX지디넷)
        title = re.sub(r'\s*\([^)]*보안뉴스[^)]*\)\s*$', '', title)  # (XX보안뉴스)
        title = re.sub(r'\s*\([^)]*KBS[^)]*\)\s*$', '', title)  # (XXKBS)
        title = re.sub(r'\s*\([^)]*MBC[^)]*\)\s*$', '', title)  # (XXMBC)
        title = re.sub(r'\s*\([^)]*SBS[^)]*\)\s*$', '', title)  # (XXSBS)
        title = re.sub(r'\s*\([^)]*JTBC[^)]*\)\s*$', '', title)  # (XXJTBC)
        title = re.sub(r'\s*\([^)]*YTN[^)]*\)\s*$', '', title)  # (XXYTN)
        title = re.sub(r'\s*\([^)]*노컷뉴스[^)]*\)\s*$', '', title)  # (XX노컷뉴스)
        title = re.sub(r'\s*\([^)]*오마이뉴스[^)]*\)\s*$', '', title)  # (XX오마이뉴스)
        title = re.sub(r'\s*\([^)]*프레시안[^)]*\)\s*$', '', title)  # (XX프레시안)
        title = re.sub(r'\s*\([^)]*미디어오늘[^)]*\)\s*$', '', title)  # (XX미디어오늘)
        title = re.sub(r'\s*\([^)]*VENTURESQUARE[^)]*\)\s*$', '', title)  # (XXVENTURESQUARE)
        title = re.sub(r'\s*\([^)]*PLATUM[^)]*\)\s*$', '', title)  # (XXPLATUM)
        title = re.sub(r'\s*\([^)]*NEWS1[^)]*\)\s*$', '', title)  # (XXNEWS1)
        title = re.sub(r'\s*\([^)]*SEOULFN[^)]*\)\s*$', '', title)  # (XXSEOULFN)
        title = re.sub(r'\s*\([^)]*BREAKNEWS[^)]*\)\s*$', '', title)  # (XXBREAKNEWS)
        
        # 일반적인 언론사 패턴 (괄호 안에 2-15글자 언론사명)
        title = re.sub(r'\s*\([^)]{2,15}\)\s*$', '', title)
        
        # 쉼표 정규화 (쉼표 제거)
        title = re.sub(r'\s*,\s*', ' ', title)
        
        # 특수문자 정규화 - 중요한 추가!
        # 다양한 형태의 중점, 점, 구분자들을 통일
        title = title.replace('‧', '·')  # 중점 (U+2027) -> 중점 (U+00B7)
        title = title.replace('•', '·')  # 불릿 -> 중점
        title = title.replace('–', '-')  # en dash -> 하이픈
        title = title.replace('—', '-')  # em dash -> 하이픈
        title = title.replace('―', '-')  # 수평선 -> 하이픈
        
        # 문장부호 정규화
        title = re.sub(r'["""'']', '"', title)  # 따옴표 통일
        
        # 문장 끝 표현 정규화 ("한다", "한다", "키운다" 등을 제거)
        title = re.sub(r'\s*(한다|한다|키운다|양성한다?)\s*$', '', title)
        
        # 앞뒤 공백 제거
        title = title.strip()
        
        return title

    def _calculate_text_similarity(self, text1, text2):
        """두 텍스트 간의 유사도를 계산합니다 (0.0 ~ 1.0)"""
        if not text1 or not text2:
            return 0.0
        
        # 텍스트를 소문자로 변환하고 공백으로 분할
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        # Jaccard 유사도 계산
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        if union == 0:
            return 0.0
        
        jaccard_similarity = intersection / union
        
        # 추가로 문자열 길이 기반 유사도도 고려
        # 더 짧은 문자열을 기준으로 공통 부분의 비율 계산
        shorter_text = text1 if len(text1) <= len(text2) else text2
        longer_text = text2 if len(text1) <= len(text2) else text1
        
        # 공통 부분 찾기 (연속된 문자열)
        common_length = 0
        for i in range(len(shorter_text)):
            for j in range(i + 1, len(shorter_text) + 1):
                substring = shorter_text[i:j]
                if substring in longer_text and len(substring) > common_length:
                    common_length = len(substring)
        
        length_similarity = common_length / len(shorter_text) if shorter_text else 0.0
        
        # Jaccard 유사도와 길이 유사도의 가중 평균
        # Jaccard에 더 높은 가중치를 줌 (단어 기반이 더 정확)
        final_similarity = (jaccard_similarity * 0.7) + (length_similarity * 0.3)
        
        return final_similarity

    def _normalize_date(self, published):
        """발행일을 정규화하여 중복 제거에 사용합니다 (날짜만 추출)"""
        import re
        from datetime import datetime
        
        try:
            # RFC 2822 형식 파싱 (예: "Thu, 12 Jun 2025 09:14:00 +0900")
            if published:
                # 날짜 부분만 추출 (시간 제거)
                date_match = re.search(r'(\w{3}, \d{1,2} \w{3} \d{4})', published)
                if date_match:
                    date_str = date_match.group(1)
                    # 날짜 객체로 파싱하여 YYYY-MM-DD 형식으로 반환
                    date_obj = datetime.strptime(date_str, '%a, %d %b %Y')
                    return date_obj.strftime('%Y-%m-%d')
        except Exception as e:
            print(f"날짜 정규화 오류: {e}")
        
        # 파싱 실패 시 원본 반환
        return published

    def _parse_naver_news_item(self, item, query):
        """네이버 뉴스 아이템을 파싱합니다"""
        # HTML 태그 제거
        title = self._clean_text(item.get('title', ''))
        description = self._clean_text(item.get('description', ''))
        
        # 날짜 형식 변환 (네이버 API는 RFC 2822 형식 사용)
        pub_date = item.get('pubDate', '')
        
        # 네이버 뉴스에서 언론기관명 추출 (링크에서 도메인 추출)
        source_name = '네이버뉴스'
        original_link = item.get('originallink', '')
        if original_link:
            try:
                domain = urlparse(original_link).netloc
                source_name = self.extract_source_name_from_domain(domain)
            except:
                source_name = '네이버뉴스'
        
        return {
            'title': title,
            'link': item.get('link', ''),
            'originallink': item.get('originallink', ''),
            'description': description,
            'published': pub_date,
            'source': source_name,
            'search_source': '네이버뉴스검색',
            'category': 'search',
            'query': query
        }

    def search_google_news(self, query):
        """구글 뉴스에서 검색어로 뉴스를 검색합니다"""
        print(f"[GOOGLE SEARCH] Starting Google News search for query: '{query}'")
        try:
            # 한글 인코딩 문제 해결을 위한 개선된 URL 인코딩
            print(f"[GOOGLE SEARCH] Original query: '{query}' (type: {type(query)})")
            
            # 1단계: UTF-8로 인코딩 확인
            if isinstance(query, str):
                query_bytes = query.encode('utf-8')
                print(f"[GOOGLE SEARCH] Query bytes (UTF-8): {query_bytes}")
            else:
                query_bytes = str(query).encode('utf-8')
            
            # 2단계: URL 인코딩 (한글 지원) - 더 안정적인 방법
            encoded_query = quote(query, safe='', encoding='utf-8')
            print(f"[GOOGLE SEARCH] Encoded query: '{encoded_query}'")
            
            # 3단계: URL 생성 - 더 안정적인 구글 뉴스 RSS URL 사용
            url = f"https://news.google.com/rss/search?q={encoded_query}&hl=ko&gl=KR&ceid=KR:ko"
            print(f"[GOOGLE SEARCH] Final Google News URL: {url}")
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
            
            print(f"[GOOGLE SEARCH] Searching Google News with URL: {url}")
            
            # 더 긴 타임아웃과 재시도 로직
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = self.session.get(url, headers=headers, timeout=30)
                    print(f"[GOOGLE SEARCH] Attempt {attempt + 1}: Response status: {response.status_code}")
                    print(f"[GOOGLE SEARCH] Response encoding: {response.encoding}")
                    response.raise_for_status()
                    break
                except Exception as e:
                    print(f"[GOOGLE SEARCH] Attempt {attempt + 1} failed: {e}")
                    if attempt == max_retries - 1:
                        raise e
                    import time
                    time.sleep(2)
            
            # XML 파싱 (인코딩 문제 해결)
            print(f"[GOOGLE SEARCH] Response content length: {len(response.content)}")
            print(f"[GOOGLE SEARCH] Response content preview: {response.content[:200]}...")
            
            # UTF-8로 명시적 디코딩
            content = response.content.decode('utf-8', errors='ignore')
            root = ET.fromstring(content)
            
            items = []
            
            # RSS 2.0 형식 파싱
            item_count = 0
            for item in root.findall('.//item'):
                try:
                    title = item.find('title')
                    link = item.find('link')
                    description = item.find('description')
                    pub_date = item.find('pubDate')
                    source = item.find('source')
                    
                    # 구글 뉴스의 경우 description에 HTML이 포함되어 있음
                    desc_text = ''
                    if description is not None and description.text:
                        desc_text = self._clean_text(description.text)
                    
                    # 소스 정보 추출 (구글 뉴스에서는 언론기관명이 source 태그에 있음)
                    source_name = '구글뉴스'
                    if source is not None and source.text:
                        source_name = source.text
                    
                    news_item = {
                        'title': self._clean_text(title.text if title is not None else 'No title'),
                        'link': link.text if link is not None else '',
                        'description': desc_text,
                        'published': pub_date.text if pub_date is not None else '',
                        'source': source_name,
                        'search_source': '구글뉴스검색',
                        'category': 'search',
                        'query': query
                    }
                    items.append(news_item)
                    item_count += 1
                    print(f"[GOOGLE SEARCH] Item {item_count}: {news_item['title'][:50]}...")
                except Exception as e:
                    print(f"[GOOGLE SEARCH] Error parsing item {item_count}: {e}")
                    continue
            
            print(f"[GOOGLE SEARCH] Found {len(items)} news items for query: {query}")
            # 최신 순으로 정렬
            return self.sort_news_by_date(items)
            
        except Exception as e:
            print(f"[GOOGLE SEARCH] Error searching Google News for '{query}': {e}")
            import traceback
            traceback.print_exc()
            return []

    def sort_news_by_date(self, news_list):
        """뉴스 리스트를 최신 순으로 정렬합니다"""
        try:
            return sorted(news_list, key=lambda x: self.parse_date(x.get('published', '')) or datetime.min.replace(tzinfo=pytz.UTC), reverse=True)
        except Exception as e:
            print(f"Sorting error: {e}")
            return news_list

    def search_news(self, query, condition='exact', naver_enabled=True, google_enabled=True, duplicate_threshold=0.5, **kwargs):
        """뉴스를 검색합니다 (네이버, 구글, RSS 소스 포함)."""
        print(f"[SEARCH_NEWS] Function called with query: '{query}'")
        print(f"[SEARCH_NEWS] condition: {condition}")
        print(f"[SEARCH_NEWS] naver_enabled: {naver_enabled}")
        print(f"[SEARCH_NEWS] google_enabled: {google_enabled}")
        print(f"[SEARCH_NEWS] duplicate_threshold: {duplicate_threshold}")
        
        # 검색 조건에 따라 다른 메서드 호출
        if condition == 'and':
            keywords = [kw.strip() for kw in query.split() if kw.strip()]
            return self.search_news_and(keywords, naver_enabled=naver_enabled, google_enabled=google_enabled)
        elif condition == 'or':
            keywords = [kw.strip() for kw in query.split() if kw.strip()]
            return self.search_news_or(keywords, naver_enabled=naver_enabled, google_enabled=google_enabled)
        
        # 기본 검색 (exact)
        all_news = []
        
        # 검색할 소스 설정
        search_sources = {
            'naver': naver_enabled,
            'google': google_enabled
        }
        
        self.total_sources = sum(search_sources.values())
        self.completed_sources = 0
        self.status = 'searching'
        
        print(f"[SEARCH] Searching for: '{query}' in sources: {search_sources}")
        print(f"[SEARCH] Query type: {type(query)}, Query bytes: {query.encode('utf-8')}")
        print(f"[SEARCH] naver_enabled: {naver_enabled}, google_enabled: {google_enabled}")
        
        # 네이버 뉴스 검색
        if naver_enabled:
            self.current_source = f"네이버뉴스 검색 중... ('{query}')"
            try:
                naver_items = self.search_naver_news(query, display=1000)  # 최대 1000개로 증가
                print(f"Naver search completed: {len(naver_items)} items")
                
                # 네이버 검색 결과를 그대로 사용 (필터링 제거)
                all_news.extend(naver_items)
                print(f"Naver results: {len(naver_items)} items")
                self.completed_sources += 1
            except Exception as e:
                print(f"Error searching Naver News: {e}")
                self.completed_sources += 1
        
        # 구글 뉴스 검색
        if google_enabled:
            print(f"[SEARCH] Google search is ENABLED for query: '{query}'")
            self.current_source = f"구글뉴스 검색 중... ('{query}')"
            try:
                google_items = self.search_google_news(query)
                print(f"[SEARCH] Google search completed: {len(google_items)} items")
                
                # 구글 검색 결과를 그대로 사용 (필터링 제거)
                all_news.extend(google_items)
                print(f"[SEARCH] Google results added to all_news: {len(google_items)} items")
                self.completed_sources += 1
            except Exception as e:
                print(f"[SEARCH] Error searching Google News: {e}")
                self.completed_sources += 1
        else:
            print(f"[SEARCH] Google search is DISABLED for query: '{query}'")
        

        
        self.status = 'completed'
        
        # 발행 시간 기준으로 정렬
        all_news.sort(key=lambda x: self.parse_date(x.get('published', '')) or datetime.min.replace(tzinfo=pytz.UTC), reverse=True)
        
        # 기사 제목과 발행일 기준 중복 제거 (텍스트 기반 중복도 체크)
        unique_news = []
        duplicate_count = 0
        
        print(f"[DEBUG] 중복 제거 시작 - 총 뉴스: {len(all_news)}")
        
        # 임시로 중복 제거 비활성화 - 모든 뉴스를 그대로 추가
        unique_news = all_news.copy()
        print(f"[DEBUG] 중복 제거 비활성화 - 모든 뉴스 보존: {len(unique_news)}")
        
        print(f"[DEBUG] 중복 제거 완료 - 제거된 중복: {duplicate_count}, 남은 기사: {len(unique_news)}")
        
        print(f"Total search results: {len(all_news)}")
        print(f"Duplicate titles removed: {duplicate_count}")
        print(f"Unique news after deduplication: {len(unique_news)}")
        
        # 중복 제거 전후 정보를 포함한 결과 반환
        result = {
            'news': unique_news,
            'total_before_dedup': len(all_news),
            'duplicates_removed': duplicate_count,
            'total_after_dedup': len(unique_news)
        }
        
        print(f"[DEBUG] 반환할 결과: {result}")
        print(f"[DEBUG] result 타입: {type(result)}")
        print(f"[DEBUG] result 키들: {list(result.keys())}")
        
        return result

    def search_news_and(self, keywords, naver_enabled=True, google_enabled=True):
        """AND 검색 - 모든 키워드가 포함된 뉴스를 검색합니다."""
        all_news = []
        
        # 검색할 소스 설정
        search_sources = {
            'naver': naver_enabled,
            'google': google_enabled
        }
        
        # 네이버 뉴스 검색
        if naver_enabled:
            try:
                naver_items = self.search_naver_news(' '.join(keywords), display=1000)  # 최대 1000개로 증가
                # 네이버 검색 결과를 그대로 사용 (필터링 제거)
                all_news.extend(naver_items)
            except Exception as e:
                print(f"Error AND searching Naver News: {e}")
        
        # 구글 뉴스 검색
        if google_enabled:
            try:
                google_items = self.search_google_news(' '.join(keywords))
                # 구글 검색 결과를 그대로 사용 (필터링 제거)
                all_news.extend(google_items)
            except Exception as e:
                print(f"Error AND searching Google News: {e}")
        

        
        # 발행 시간 기준으로 정렬
        all_news.sort(key=lambda x: self.parse_date(x.get('published', '')) or datetime.min.replace(tzinfo=pytz.UTC), reverse=True)
        
        # 딕셔너리 형태로 반환
        return {
            'news': all_news,
            'total_before_dedup': len(all_news),
            'duplicates_removed': 0,
            'total_after_dedup': len(all_news)
        }

    def search_news_or(self, keywords, naver_enabled=True, google_enabled=True):
        """OR 검색 - 키워드 중 하나라도 포함된 뉴스를 검색합니다."""
        all_news = []
        
        # 검색할 소스 설정
        search_sources = {
            'naver': naver_enabled,
            'google': google_enabled
        }
        
        # 네이버 뉴스 검색
        if naver_enabled:
            try:
                naver_items = self.search_naver_news(' '.join(keywords), display=1000)  # 최대 1000개로 증가
                # 네이버 검색 결과를 그대로 사용 (필터링 제거)
                all_news.extend(naver_items)
            except Exception as e:
                print(f"Error OR searching Naver News: {e}")
        
        # 구글 뉴스 검색
        if google_enabled:
            try:
                google_items = self.search_google_news(' '.join(keywords))
                # 구글 검색 결과를 그대로 사용 (필터링 제거)
                all_news.extend(google_items)
            except Exception as e:
                print(f"Error OR searching Google News: {e}")
        

        
        # 발행 시간 기준으로 정렬
        all_news.sort(key=lambda x: self.parse_date(x.get('published', '')) or datetime.min.replace(tzinfo=pytz.UTC), reverse=True)
        
        # 딕셔너리 형태로 반환
        return {
            'news': all_news,
            'total_before_dedup': len(all_news),
            'duplicates_removed': 0,
            'total_after_dedup': len(all_news)
        }

    def get_news_by_category(self, category):
        """카테고리별 뉴스를 가져옵니다."""
        return self.search_news(category)

    def _fetch_rss_news(self, rss_url, source_name):
        """RSS 피드에서 뉴스를 가져옵니다."""
        try:
            print(f"Fetching RSS from {source_name}: {rss_url}")
            
            # 한겨레의 경우 특별한 User-Agent 사용
            headers = {}
            if 'hani.co.kr' in rss_url:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            
            response = self.session.get(rss_url, timeout=15, headers=headers)
            response.raise_for_status()
            
            feed = feedparser.parse(response.content)
            news_items = []
            
            print(f"Parsed {len(feed.entries)} entries from {source_name}")
            
            for entry in feed.entries:
                try:
                    # 제목과 설명 정리
                    title = self._clean_text(entry.get('title', ''))
                    description = self._clean_text(entry.get('summary', ''))
                    
                    # 링크 처리
                    link = entry.get('link', '')
                    if link:
                        link = self._normalize_url(link)
                    
                    # 발행일 처리
                    published = entry.get('published', '')
                    if not published:
                        published = entry.get('updated', '')
                    
                    news_item = {
                        'title': title,
                        'description': description,
                        'link': link,
                        'published': published,
                        'source': source_name,
                        'author': entry.get('author', ''),
                        'category': entry.get('category', '')
                    }
                    
                    news_items.append(news_item)
                    
                except Exception as e:
                    print(f"Error parsing RSS entry from {source_name}: {e}")
                    continue
            
            return news_items
            
        except Exception as e:
            print(f"Error fetching RSS from {source_name}: {e}")
            return []

    def _clean_text(self, text):
        """텍스트를 정리합니다."""
        if not text:
            return ""
        
        # HTML 태그 제거
        soup = BeautifulSoup(text, 'html.parser')
        text = soup.get_text()
        
        # 공백 정리
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text

    def _normalize_url(self, url):
        """URL을 정규화합니다."""
        if not url:
            return ""
        
        # 상대 URL을 절대 URL로 변환
        if url.startswith('/'):
            return url
        
        return url

    def parse_date(self, date_string):
        """날짜 문자열을 파싱합니다."""
        if not date_string:
            return None
        
        try:
            # 다양한 날짜 형식 처리
            date_formats = [
                '%a, %d %b %Y %H:%M:%S %Z',
                '%a, %d %b %Y %H:%M:%S %z',
                '%Y-%m-%dT%H:%M:%S%z',
                '%Y-%m-%dT%H:%M:%SZ',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d'
            ]
            
            for fmt in date_formats:
                try:
                    if fmt.endswith('Z'):
                        # Z를 +00:00으로 변환
                        date_string = date_string.replace('Z', '+00:00')
                        fmt = fmt.replace('Z', '%z')
                    
                    parsed_date = datetime.strptime(date_string, fmt)
                    
                    # timezone 정보가 없으면 UTC로 설정
                    if parsed_date.tzinfo is None:
                        parsed_date = pytz.UTC.localize(parsed_date)
                    
                    return parsed_date
                    
                except ValueError:
                    continue
            
            # feedparser의 파싱 시도
            try:
                import feedparser
                parsed = feedparser._parse_date(date_string)
                if parsed:
                    return datetime.fromtimestamp(parsed, tz=pytz.UTC)
            except:
                pass
            
            return None
            
        except Exception as e:
            print(f"Error parsing date '{date_string}': {e}")
            return None 