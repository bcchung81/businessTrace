from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import re

db = SQLAlchemy()

# 관리자 이메일 목록 (자료실 전체 관리 권한)
ADMIN_EMAILS = ['redscv@gmail.com', 'thankyou@kca.kr']

class User(db.Model):
    """사용자 모델"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    def __init__(self, email, password):
        self.email = email.lower().strip()
        self.set_password(password)
    
    def set_password(self, password):
        """비밀번호를 해시화하여 저장"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """비밀번호 검증"""
        return check_password_hash(self.password_hash, password)
    
    def reset_password(self, new_password):
        """비밀번호 초기화"""
        self.set_password(new_password)
        self.updated_at = datetime.utcnow()
    
    @staticmethod
    def validate_email(email):
        """이메일 형식 검증"""
        if not email:
            return False, "이메일 주소를 입력해주세요."
        
        email = email.lower().strip()
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        
        if not re.match(pattern, email):
            return False, "올바른 이메일 형식이 아닙니다."
        
        return True, email
    
    @staticmethod
    def validate_password(password):
        """비밀번호 형식 검증"""
        if not password:
            return False, "비밀번호를 입력해주세요."
        
        if len(password) < 8:
            return False, "비밀번호는 최소 8자 이상이어야 합니다."
        
        if len(password) > 128:
            return False, "비밀번호는 최대 128자까지 가능합니다."
        
        # 영문, 숫자, 특수문자 중 최소 2가지 조합
        has_letter = bool(re.search(r'[a-zA-Z]', password))
        has_digit = bool(re.search(r'\d', password))
        has_special = bool(re.search(r'[!@#$%^&*(),.?":{}|<>]', password))
        
        combinations = sum([has_letter, has_digit, has_special])
        if combinations < 2:
            return False, "비밀번호는 영문, 숫자, 특수문자 중 최소 2가지 조합이어야 합니다."
        
        return True, password
    
    def is_admin(self):
        """관리자 권한 확인 (자료실 전체 관리 가능)"""
        return self.email in ADMIN_EMAILS
    
    def to_dict(self):
        """사용자 정보를 딕셔너리로 반환 (비밀번호 제외)"""
        return {
            'id': self.id,
            'email': self.email,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_active': self.is_active,
            'is_admin': self.is_admin()
        }
    
    def __repr__(self):
        return f'<User {self.email}>'


class Archive(db.Model):
    """공개자료실 모델"""
    __tablename__ = 'archives'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)  # 원본 파일명 (사용자가 보는 이름)
    stored_filename = db.Column(db.String(255), nullable=False)  # 저장된 파일명
    file_path = db.Column(db.String(500), nullable=False)  # 실제 저장된 파일 경로
    file_size = db.Column(db.Integer, nullable=False)  # 파일 크기 (bytes)
    company_name = db.Column(db.String(100), nullable=False)  # 분석한 기업명
    analyzer_name = db.Column(db.String(100), nullable=False)  # 분석자 (사용자 아이디)
    analysis_period = db.Column(db.String(100), nullable=True)  # 분석기간
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 사용자와의 관계
    user = db.relationship('User', backref=db.backref('archives', lazy=True, cascade='all, delete-orphan'))
    
    def __init__(self, user_id, original_filename, file_path, file_size, company_name, stored_filename=None, analyzer_name=None, analysis_period=None):
        self.user_id = user_id
        self.original_filename = original_filename
        self.file_path = file_path
        self.file_size = file_size
        self.company_name = company_name
        self.stored_filename = stored_filename or original_filename
        self.analyzer_name = analyzer_name or 'unknown'
        self.analysis_period = analysis_period
    
    def to_dict(self):
        """아카이브 정보를 딕셔너리로 반환"""
        return {
            'id': self.id,
            'user_id': self.user_id,  # 사용자 ID 추가
            'original_filename': self.original_filename,
            'file_size': self.file_size,
            'company_name': self.company_name,
            'analyzer_name': self.analyzer_name,
            'analysis_period': self.analysis_period,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Archive {self.original_filename} - {self.company_name}>'


class Company(db.Model):
    """기업 관리 모델"""
    __tablename__ = 'companies'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)  # 기업명
    year = db.Column(db.Integer, nullable=False, index=True)  # 연도 (2024, 2025, 2026 등)
    display_order = db.Column(db.Integer, default=0)  # 표시 순서
    is_active = db.Column(db.Boolean, default=True)  # 활성화 여부
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 연도와 기업명의 조합은 유니크해야 함
    __table_args__ = (
        db.UniqueConstraint('name', 'year', name='unique_company_year'),
    )
    
    def __init__(self, name, year, display_order=0, is_active=True):
        self.name = name.strip()
        self.year = year
        self.display_order = display_order
        self.is_active = is_active
    
    def to_dict(self):
        """기업 정보를 딕셔너리로 반환"""
        return {
            'id': self.id,
            'name': self.name,
            'year': self.year,
            'display_order': self.display_order,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<Company {self.name} ({self.year})>'
