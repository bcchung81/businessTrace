from flask import Flask
import os

def create_app():
    app = Flask(__name__)
    
    # 세션을 위한 시크릿 키 설정
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "news-homepage-secret-key-2025")
    
    # 세션 설정
    app.config["SESSION_PERMANENT"] = False
    app.config["SESSION_TYPE"] = "filesystem"
    
    # 데이터베이스 설정
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'instance', 'news_homepage.db')
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
        "DATABASE_URL", f"sqlite:///{db_path}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    
    # 데이터베이스 초기화
    from app.models import db
    db.init_app(app)
    
    # 데이터베이스 테이블 생성
    with app.app_context():
        db.create_all()
    
    # 블루프린트 등록
    from app.routes import main
    app.register_blueprint(main)
    
    return app 