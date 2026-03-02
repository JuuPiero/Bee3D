import { _decorator, Camera, Component, Node, UITransform } from 'cc';
const { ccclass, property } = _decorator;
const OG_SIZE = 7.6;

@ccclass('LevelScaler')
export class LevelScaler extends Component
{
    @property(Camera) mainCamera: Camera = null;
    @property(UITransform) canvasRect: UITransform = null;
    @property(Node) lowerPoint: Node = null;
    
    public scaleToFitScreen(): void
    {
        const ratio = this.canvasRect.contentSize.width / this.canvasRect.contentSize.height;
        const orthoWidth = this.mainCamera.orthoHeight * ratio;
        // Chỉ scale khi màn hình hẹp hơn 16:9, ngược lại giữ nguyên
        const newObjectScale = ratio <= (9 / 16) ? (orthoWidth * 2) / OG_SIZE : 1;
        this.node.setScale(newObjectScale, newObjectScale, newObjectScale);
    }
}


