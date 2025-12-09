import { _decorator, Component, Camera, RenderTexture, SpriteFrame, Sprite, Node, Material, Vec2, CCFloat, director, game } from 'cc';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('CameraBlurController')
@executeInEditMode
export class CameraBlurController extends Component {
    
    @property(Camera)
    targetCamera: Camera | null = null;
    
    @property(Material)
    blurMaterial: Material | null = null;
    
    @property(CCFloat)
    blurIntensity: number = 0.005;
    
    @property(CCFloat)
    blurSamples: number = 8;
    
    @property({ tooltip: 'Enable/Disable blur effect' })
    enableBlur: boolean = true;
    
    private renderTexture: RenderTexture | null = null;
    private blurNode: Node | null = null;
    @property(Sprite)
    private blurSprite: Sprite | null = null;
    private originalTargetTexture: RenderTexture | null = null;
    
    onLoad() {
        // Get main camera if not assigned
        if (!this.targetCamera) {
            this.targetCamera = director.getScene()?.getComponentInChildren(Camera) || null;
        }
        
        this.setupBlurEffect();
    }
    
    start() {
        this.updateBlurProperties();
    }
    
    onDestroy() {
        this.cleanup();
    }
    
    /**
     * Sets up the blur effect by creating a render texture and blur node
     */
    private setupBlurEffect() {
        if (!this.targetCamera || !this.blurMaterial) {
            console.warn('CameraBlurController: Camera or blur material not assigned');
            return;
        }
        
        // Store original target texture
        this.originalTargetTexture = this.targetCamera.targetTexture;
        
        // Create render texture
        const size = this.getCameraSize();
        this.renderTexture = new RenderTexture();
        this.renderTexture.reset({
            width: size.x,
            height: size.y
        });
        
        // Set camera to render to our texture
        this.targetCamera.targetTexture = this.renderTexture;
        
        // Create blur node
        this.createBlurNode();
        
        // Apply blur effect
        this.applyBlurEffect();
    }
    
    /**
     * Creates the blur node that will display the blurred camera output
     */
    private createBlurNode() {
        if (!this.renderTexture) return;
        
        // Create sprite frame from render texture
        const spriteFrame = new SpriteFrame();
        spriteFrame.texture = this.renderTexture;
        this.blurSprite.spriteFrame = spriteFrame;
        
        // Set material
        if (this.blurMaterial) {
            this.blurSprite.material = this.blurMaterial;
        }
        
        // Position the blur node to cover the screen
        this.positionBlurNode();
    }
    
    /**
     * Positions the blur node to cover the entire screen
     */
    private positionBlurNode() {
        if (!this.blurNode || !this.targetCamera) return;
        
        const cameraNode = this.targetCamera.node;
        const canvas = director.getScene()?.getChildByName('Canvas');
        
        if (canvas) {
            this.blurNode.parent = canvas;
            this.blurNode.setPosition(0, 0, 0);
            this.blurNode.setScale(1, 1, 1);
        }
    }
    
    /**
     * Applies the blur effect by updating material properties
     */
    private applyBlurEffect() {
        if (!this.blurMaterial) return;
        
        this.blurMaterial.setProperty('blurIntensity', this.blurIntensity);
        this.blurMaterial.setProperty('blurSamples', this.blurSamples);
    }
    
    /**
     * Gets the camera rendering size
     */
    private getCameraSize(): Vec2 {
        if (!this.targetCamera) return new Vec2(1024, 768);
        
        const view = game.canvas;
        if (view) {
            return new Vec2(view.width, view.height);
        }
        
        return new Vec2(1024, 768);
    }
    
    /**
     * Updates blur properties and applies them to the material
     */
    private updateBlurProperties() {
        if (!this.blurMaterial) return;
        
        this.blurMaterial.setProperty('blurIntensity', this.blurIntensity);
        this.blurMaterial.setProperty('blurSamples', this.blurSamples);
    }
    
    /**
     * Enables or disables the blur effect
     */
    public setBlurEnabled(enabled: boolean) {
        this.enableBlur = enabled;
        
        if (this.blurNode) {
            this.blurNode.active = enabled;
        }
        
        if (this.targetCamera) {
            if (enabled) {
                this.targetCamera.targetTexture = this.renderTexture;
            } else {
                this.targetCamera.targetTexture = this.originalTargetTexture;
            }
        }
    }
    
    /**
     * Sets the blur intensity
     */
    public setBlurIntensity(intensity: number) {
        this.blurIntensity = intensity;
        this.updateBlurProperties();
    }
    
    /**
     * Sets the number of blur samples
     */
    public setBlurSamples(samples: number) {
        this.blurSamples = samples;
        this.updateBlurProperties();
    }
    
    /**
     * Animates blur intensity over time
     */
    public animateBlur(targetIntensity: number, duration: number, onComplete?: () => void) {
        const startIntensity = this.blurIntensity;
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);
            
            // Ease out cubic
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            
            this.setBlurIntensity(startIntensity + (targetIntensity - startIntensity) * easedProgress);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else if (onComplete) {
                onComplete();
            }
        };
        
        animate();
    }
    
    /**
     * Cleanup resources
     */
    private cleanup() {
        if (this.targetCamera) {
            this.targetCamera.targetTexture = this.originalTargetTexture;
        }
        
        if (this.renderTexture) {
            this.renderTexture.destroy();
            this.renderTexture = null;
        }
        
        if (this.blurNode) {
            this.blurNode.destroy();
            this.blurNode = null;
        }
    }
    
    update(deltaTime: number) {
        // Update properties in runtime
        this.updateBlurProperties();
    }
}