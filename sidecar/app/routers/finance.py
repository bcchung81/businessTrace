from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class NormalizeRequest(BaseModel):
    corpCode: str
    fiscalYear: int


@router.post("/finance/normalize")
def normalize(payload: NormalizeRequest) -> dict:
    """dartlab 재무 정규화 자리 — Task 6 에서 채운다.

    501 로 분명히 답한다. 빈 결과를 주면 호출한 쪽이 "정규화했는데 값이 없다" 로 읽는다.
    """
    raise HTTPException(status_code=501, detail="재무 정규화는 아직 구현되지 않았습니다 (Task 6).")
