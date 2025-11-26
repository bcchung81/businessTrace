#!/usr/bin/env python3
"""
Flask 애플리케이션 환경에서 googlenewsdecoder import 테스트
"""

import sys
import os

# Flask 애플리케이션 환경 설정
os.environ['FLASK_APP'] = 'app'
os.environ['FLASK_ENV'] = 'development'

def test_flask_import():
    print("=== Flask 애플리케이션 환경에서 googlenewsdecoder import 테스트 ===\n")
    
    try:
        print("1. Flask 애플리케이션 import...")
        from app import create_app
        app = create_app()
        print("✅ Flask 애플리케이션 import 성공")
        
        print("\n2. googlenewsdecoder import 시도...")
        from googlenewsdecoder import new_decoderv1
        print("✅ googlenewsdecoder import 성공")
        
        print("\n3. new_decoderv1 함수 테스트...")
        test_url = "https://news.google.com/rss/articles/CBMiZ0FVX3lxTFBsbVk2UWFKVkhzZmFteVF5WFJMdmxVUDNPaVc2M2VYOEFDSF9PcTIwRWpOekJDamlzWG9Td0pmZ09oeW5hbU9xWGJxb3loVTBxODVsYi1sYzByRHhMeG5zR092Y2JId2vSAWtBVV95cUxQQmNTZmIxREZxd2xDZXMyOUxMOFRlcm0wdV93Z0F6aFZJeWFfRC1Qamt6YTNpWkVMbFBWLXpmNU9RQTNGY0dWQlUtbnl4OEQ0ZXFLbkZqRklWXzNwVFE5cnNEOG9fZmZBOVMwcw?oc=5"
        
        result = new_decoderv1(test_url, interval=5)
        print(f"✅ new_decoderv1 함수 호출 성공: {result}")
        
    except ImportError as e:
        print(f"❌ ImportError 발생: {e}")
        print(f"❌ 오류 타입: {type(e)}")
        import traceback
        print(f"❌ 오류 상세: {traceback.format_exc()}")
        
    except Exception as e:
        print(f"❌ 기타 오류 발생: {e}")
        print(f"❌ 오류 타입: {type(e)}")
        import traceback
        print(f"❌ 오류 상세: {traceback.format_exc()}")

if __name__ == "__main__":
    test_flask_import()
