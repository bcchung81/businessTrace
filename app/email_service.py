import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.header import Header
import os
from datetime import datetime

class EmailService:
    def __init__(self):
        # 발송자 정보 (참고 소스코드에서 가져온 계정)
        self.sender_email = "aiseoul7@gmail.com"
        self.sender_password = "meac cbqf uaeg iukb"
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 465
        
    def send_analysis_report(self, recipient_email, company_name, excel_file_path):
        """
        AI 분석 보고서를 이메일로 발송합니다.
        
        Args:
            recipient_email (str): 받는 사람 이메일 주소
            company_name (str): 분석 대상 회사명
            excel_file_path (str): 첨부할 엑셀 파일 경로
        """
        try:
            # 이메일 메시지 생성
            message = MIMEMultipart()
            message['From'] = self.sender_email
            message['To'] = recipient_email
            message['Subject'] = f"{company_name} 기업에 대한 AI 분석 보고서"
            
            # 이메일 본문 작성
            body = self._create_email_body(company_name)
            message.attach(MIMEText(body, 'plain', 'utf-8'))
            
            # 엑셀 파일 첨부
            if os.path.exists(excel_file_path):
                self._attach_file(message, excel_file_path)
            
            # 이메일 발송
            with smtplib.SMTP_SSL(self.smtp_server, self.smtp_port) as smtp:
                smtp.login(self.sender_email, self.sender_password)
                smtp.send_message(message)
            
            return {
                "success": True,
                "message": "이메일이 성공적으로 발송되었습니다."
            }
            
        except Exception as e:
            print(f"이메일 발송 중 오류 발생: {str(e)}")
            return {
                "success": False,
                "message": f"이메일 발송 중 오류가 발생했습니다: {str(e)}"
            }
    
    def _create_email_body(self, company_name):
        """이메일 본문을 생성합니다."""
        current_time = datetime.now().strftime('%Y년 %m월 %d일 %H:%M')
        
        body = f"""안녕하세요. 초격차 스타트업 성과돋보기 AI 분석가입니다.

{company_name} 기업에 대한 AI 분석 보고서를 보내드립니다.

분석 내용:
- 종합 분석
- 동향 분석
- 수상 실적 분석
- 투자 유치 분석

첨부파일로 상세한 분석 결과를 확인하실 수 있습니다.

※ 주의사항: AI가 실수를 할 수 있습니다. 분석 결과는 기초 참고 자료로 활용하고 반드시 담당자가 추가 검증을 하여야 합니다.

발송일시: {current_time}

감사합니다.
AI 초격차 스타트업 성과돋보기"""
        
        return body
    
    def _attach_file(self, message, file_path):
        """파일을 이메일에 첨부합니다."""
        try:
            with open(file_path, 'rb') as attachment:
                file_data = attachment.read()
                
                # MIMEBase 객체 생성
                mime_part = MIMEBase('application', 'octet-stream')
                mime_part.set_payload(file_data)
                encoders.encode_base64(mime_part)
                
                # 파일명 설정
                filename = os.path.basename(file_path)
                encoded_filename = Header(filename, 'utf-8').encode()
                mime_part.add_header('Content-Disposition', 'attachment', filename=encoded_filename)
                
                # 메시지에 첨부파일 추가
                message.attach(mime_part)
                
        except Exception as e:
            print(f"파일 첨부 중 오류 발생: {str(e)}")
            raise e
