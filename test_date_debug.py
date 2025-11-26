#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService
from datetime import datetime

def test_date_debug():
    print("날짜 파싱 디버그 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어
    query = "고스트패스"
    
    print(f"\n=== '{query}' 날짜 파싱 디버그 ===")
    
    try:
        # 네이버 검색 결과 분석
        print("\n--- 네이버 날짜 파싱 디버그 ---")
        naver_results = news_service.search_naver_news(query, max_results=2)
        
        for i, item in enumerate(naver_results[:2]):
            print(f"\n네이버 결과 #{i+1}:")
            print(f"  제목: {item.get('title', 'N/A')}")
            print(f"  원본 pubDate: {item.get('pubDate', 'N/A')}")
            print(f"  변환된 published: {item.get('published', 'N/A')}")
            
            # 날짜 파싱 테스트
            pub_date = item.get('pubDate', '')
            if pub_date:
                print(f"  날짜 파싱 테스트:")
                try:
                    # RFC 2822 형식 파싱 시도
                    dt = datetime.strptime(pub_date, '%a, %d %b %Y %H:%M:%S %z')
                    print(f"    파싱 성공: {dt}")
                    korean_date = dt.strftime('%Y년 %m월 %d일 %H:%M')
                    print(f"    한국어 변환: {korean_date}")
                except Exception as e:
                    print(f"    파싱 실패: {e}")
                    # 다른 형식 시도
                    try:
                        dt = datetime.strptime(pub_date, '%a, %d %b %Y %H:%M:%S %Z')
                        print(f"    대체 파싱 성공: {dt}")
                        korean_date = dt.strftime('%Y년 %m월 %d일 %H:%M')
                        print(f"    한국어 변환: {korean_date}")
                    except Exception as e2:
                        print(f"    대체 파싱도 실패: {e2}")
        
        # 구글 검색 결과 분석
        print("\n--- 구글 날짜 파싱 디버그 ---")
        google_results = news_service.search_google_news(query)
        
        for i, item in enumerate(google_results[:2]):
            print(f"\n구글 결과 #{i+1}:")
            print(f"  제목: {item.get('title', 'N/A')}")
            print(f"  원본 pubDate: {item.get('pubDate', 'N/A')}")
            print(f"  변환된 published: {item.get('published', 'N/A')}")
            
            # 날짜 파싱 테스트
            pub_date = item.get('pubDate', '')
            if pub_date:
                print(f"  날짜 파싱 테스트:")
                try:
                    # RFC 2822 형식 파싱 시도
                    dt = datetime.strptime(pub_date, '%a, %d %b %Y %H:%M:%S %Z')
                    print(f"    파싱 성공: {dt}")
                    korean_date = dt.strftime('%Y년 %m월 %d일 %H:%M')
                    print(f"    한국어 변환: {korean_date}")
                except Exception as e:
                    print(f"    파싱 실패: {e}")
                    # 다른 형식 시도
                    try:
                        dt = datetime.strptime(pub_date, '%a, %d %b %Y %H:%M:%S %z')
                        print(f"    대체 파싱 성공: {dt}")
                        korean_date = dt.strftime('%Y년 %m월 %d일 %H:%M')
                        print(f"    한국어 변환: {korean_date}")
                    except Exception as e2:
                        print(f"    대체 파싱도 실패: {e2}")
            
    except Exception as e:
        print(f"검색 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_date_debug()
