#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.news_service import NewsService

def test_dedup():
    print("중복 제거 기능 테스트 시작...")
    
    news_service = NewsService()
    
    # 테스트할 검색어들
    test_queries = ["고스트패스", "주식", "삼성전자"]
    
    for query in test_queries:
        print(f"\n=== '{query}' 중복 제거 테스트 ===")
        
        try:
            # 중복 제거 활성화 (threshold=0.5)
            results = news_service.search_news_by_period(
                query, 
                duplicate_threshold=0.5,
                naver_enabled=True, 
                google_enabled=True
            )
            
            print(f"\n=== '{query}' 검색 결과 ===")
            print(f"중복 제거 전: {results.get('total_before_dedup', 0)}개")
            print(f"중복 제거 후: {results.get('total_after_dedup', 0)}개")
            print(f"제거된 중복: {results.get('duplicates_removed', 0)}개")
            
            if results.get('news'):
                print(f"첫 번째 결과: {results['news'][0].get('title', 'N/A')}")
                print(f"마지막 결과: {results['news'][-1].get('title', 'N/A')}")
                
                # 소스별 결과 수 계산
                source_counts = {}
                for item in results['news']:
                    source = item.get('search_source', 'unknown')
                    source_counts[source] = source_counts.get(source, 0) + 1
                
                print(f"소스별 결과 수: {source_counts}")
                
        except Exception as e:
            print(f"검색 오류: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    test_dedup()
