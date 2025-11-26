import requests
from datetime import datetime
import pytz
from urllib.parse import quote
import xml.etree.ElementTree as ET

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

    def search_naver_news(self, query, display=100):
        """네이버 뉴스 검색"""
        print(f"[NAVER] Searching for: '{query}'")
        
        headers = {
            'X-Naver-Client-Id': self.naver_client_id,
            'X-Naver-Client-Secret': self.naver_client_secret
        }
        
        params = {
            'query': query,
            'display': display,
            'start': 1,
            'sort': 'date'
        }
        
        try:
            response = self.session.get(self.naver_news_url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            items = data.get('items', [])
            
            print(f"[NAVER] Found {len(items)} items")
            
            # 검색 결과에 소스 정보 추가
            for item in items:
                item['search_source'] = '네이버뉴스검색'
                item['query'] = query
            
            return items
            
        except Exception as e:
            print(f"[NAVER] Error: {e}")
            return []

    def search_google_news(self, query):
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
            
            response = self.session.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            print(f"[GOOGLE] Response status: {response.status_code}")
            print(f"[GOOGLE] Response length: {len(response.content)}")
            
            # XML 파싱
            root = ET.fromstring(response.content)
            
            items = []
            for item in root.findall('.//item'):
                try:
                    title = item.find('title').text if item.find('title') is not None else ''
                    link = item.find('link').text if item.find('link') is not None else ''
                    description = item.find('description').text if item.find('description') is not None else ''
                    pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''
                    
                    news_item = {
                        'title': title,
                        'link': link,
                        'description': description,
                        'published': pub_date,
                        'search_source': '구글뉴스검색',
                        'query': query
                    }
                    
                    items.append(news_item)
                    
                except Exception as e:
                    print(f"[GOOGLE] Error parsing item: {e}")
                    continue
            
            print(f"[GOOGLE] Found {len(items)} items")
            return items
            
        except Exception as e:
            print(f"[GOOGLE] Error: {e}")
            return []

    def search_news(self, query, naver_enabled=True, google_enabled=True):
        """기본 뉴스 검색 (네이버 + 구글)"""
        print(f"[SEARCH] Starting search for: '{query}'")
        print(f"[SEARCH] naver_enabled: {naver_enabled}, google_enabled: {google_enabled}")
        
        all_news = []
        
        # 네이버 검색
        if naver_enabled:
            print(f"[SEARCH] Calling Naver search...")
            naver_items = self.search_naver_news(query)
            all_news.extend(naver_items)
            print(f"[SEARCH] Naver results: {len(naver_items)}")
        
        # 구글 검색
        if google_enabled:
            print(f"[SEARCH] Calling Google search...")
            google_items = self.search_google_news(query)
            all_news.extend(google_items)
            print(f"[SEARCH] Google results: {len(google_items)}")
        
        print(f"[SEARCH] Total results: {len(all_news)}")
        
        # 딕셔너리 형태로 반환
        return {
            'news': all_news,
            'total_before_dedup': len(all_news),
            'duplicates_removed': 0,
            'total_after_dedup': len(all_news)
        }

    def search_news_by_period(self, query, start_date=None, end_date=None, limit=None, naver_enabled=True, google_enabled=True):
        """기간별 뉴스 검색 (간단한 버전)"""
        print(f"[PERIOD SEARCH] Starting period search for: '{query}'")
        print(f"[PERIOD SEARCH] naver_enabled: {naver_enabled}, google_enabled: {google_enabled}")
        
        # 기본 검색 수행
        search_results = self.search_news(query, naver_enabled=naver_enabled, google_enabled=google_enabled)
        
        print(f"[PERIOD SEARCH] Search completed, results: {search_results}")
        
        # 결과 반환
        return search_results
