# Imports
from fastapi import FastAPI, Depends
from auth import check_api_key 
from pydantic import BaseModel
from deepface import DeepFace
from PIL import Image
import base64
from io import BytesIO
import os

img1_path = 'deepface/test/img1.jpg'
img2_path = 'deepface/test/img2.jpg'
result = DeepFace.verify(img1_path,img2_path, anti_spoofing = True )
print("Face API Status:",result["verified"])

# Fast API Classes

class ItemComparison(BaseModel):
    image1 : str
    image2 : str

class ItemUser(BaseModel):
    image : str
    address : str

class ItemFind(BaseModel):
    image : str

app = FastAPI(max_request_body_size=10 * 1024 * 1024)

@app.get("/", dependencies=[Depends(check_api_key)])
async def root():
    return {"message": "Hello World"}

@app.post("/saveUser", dependencies=[Depends(check_api_key)])
async def saveUser(item: ItemUser):
    if os.path.isfile(f'deepface/db/{item.address}.jpg'):
        return {"result": "Address already exists"}
    random_string = os.urandom(32).hex()
    userImage = base64.b64decode(item.image)
    userImage = Image.open(BytesIO(userImage))
    userImage.save(f'deepface/temp/{random_string}.jpg')
    '''
        try:
            DeepFace.find(img_path= f'deepface/temp/{random_string}.jpg', db_path='deepface/db', anti_spoofing = True)
            return {"result": "User already exists"}
        except ValueError as e:
            ...
        finally:
            os.remove(f'deepface/temp/{random_string}.jpg')
    '''
    userImage = base64.b64decode(item.image)
    userImage = Image.open(BytesIO(userImage))
    userImage.save(f'deepface/db/{item.address}.jpg')
    return {"result": "User saved"}

@app.post("/findUser", dependencies=[Depends(check_api_key)])
async def findUser(item: ItemFind):
    random_string = os.urandom(32).hex()
    userImage = base64.b64decode(item.image)
    userImage = Image.open(BytesIO(userImage))
    userImage.save(f'deepface/temp/{random_string}.jpg')
    try:
        result = DeepFace.find(img_path= f'deepface/temp/{random_string}.jpg', db_path='deepface/db', anti_spoofing = True)
        return {"result": result[0].identity[0].split('.')[0].split('/')[2]}
    except ValueError as e:
        return {"result": False}
    finally:
        os.remove(f'deepface/temp/{random_string}.jpg')