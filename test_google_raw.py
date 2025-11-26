#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import xml.etree.ElementTree as ET
import requests
from urllib.parse import quote

def test_google_raw():
    print("구글 RSS 원본 데이터 구조 확인...")
    
    query = "고스트패스"
    
    try:
        # URL 인코딩
        encoded_query = quote(query, safe='', encoding='utf-8')
        url = f"https://news.google.com/rss/search?q={encoded_query}&hl=ko&gl=KR&ceid=KR:ko"
        
        print(f"URL: {url}")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        print(f"Response status: {response.status_code}")
        print(f"Response length: {len(response.content)}")
        
        # XML 파싱
        root = ET.fromstring(response.content)
        
        print("\n=== 첫 번째 item의 모든 필드 ===")
        first_item = root.find('.//item')
        if first_item is not None:
            for child in first_item:
                print(f"  {child.tag}: {child.text}")
        
        print("\n=== 처음 3개 item의 날짜 필드 ===")
        items = root.findall('.//item')
        for i, item in enumerate(items[:3]):
            print(f"\nItem #{i+1}:")
            title = item.find('title')
            pub_date = item.find('pubDate')
            print(f"  title: {title.text if title is not None else 'N/A'}")
            print(f"  pubDate: {pub_date.text if pub_date is not None else 'N/A'}")
            
            # 모든 자식 요소 확인
            for child in item:
                if child.tag not in ['title', 'pubDate']:
                    print(f"  {child.tag}: {child.text}")
            
    except Exception as e:
        print(f"오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_google_raw()
