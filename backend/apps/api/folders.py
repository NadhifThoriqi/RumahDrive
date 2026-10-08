from fastapi import APIRouter, Path, Body, Depends

from ..service import folders, files

router = APIRouter(prefix="/folders", tags=["folders"])

@router.get("/{folder_id:str}")
async def show_folder(
    folder_id: str = Path(..., description="ID dari folder yang ingin ditampilkan"),
    password: bool = Depends(files.key)
):
    return await folders.detail(folder_id, root= password)

@router.post("/")
async def create_folder(
    name: str = Body(..., description="Nama dari folder yang ingin dibuat"),
    parent_path: str = Body(..., description="Path dari parent folder tempat folder baru akan dibuat"),
    password: bool = Depends(files.key)
): 
    return await folders.create(name, root=password, path=parent_path)

@router.patch("/{folder_id:str}")
async def rename_folder(
    folder_id: str = Path(..., description="ID dari folder yang ingin diubah namanya"),
    new_name: str = Body(..., description="Nama baru untuk folder"),
    password: bool = Depends(files.key)
):
    return await folders.rename(folder_id, new_name, root=password)

@router.patch("/{folder_id:str}/move")
async def move_folder(
    folder_id: str = Path(..., description="ID dari folder yang ingin dipindahkan"),
    new_parent_path: str = Body(..., description="Path dari parent folder baru"),
    password: bool = Depends(files.key)
):
    return await folders.move(folder_id, new_parent_path, root=password)

@router.delete("/{folder_id:str}")
async def delete_folder(
    folder_id: str = Path(..., description="ID dari folder yang ingin dihapus"),
    password: bool = Depends(files.key)
):
    return await folders.delete(folder_id, root=password)