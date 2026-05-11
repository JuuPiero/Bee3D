import { _decorator, CCFloat, CCInteger, Component, Tween, easing, tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TweenShake')
export class TweenShake extends Component {

	@property
	playOnEnable: boolean = true;

	@property(CCFloat)
	duration: number = 0.08;

	@property(CCFloat)
	strength: number = 8;

	@property(CCInteger)
	vibrato: number = 6;

	@property
	restorePositionOnFinish: boolean = true;

	private _initialPosition: Vec3 = new Vec3();
	private _cachedInitialPosition: Vec3 = new Vec3();
	private _isShaking: boolean = false;

	protected onLoad(): void
	{
		this.captureInitialPosition();
	}

	protected onEnable(): void
	{
		this.captureInitialPosition();
		if (this.playOnEnable)
		{
			this.playShake();
		}
	}

	protected onDisable(): void
	{
		this.stopShake(this.restorePositionOnFinish);
	}

	protected onDestroy(): void
	{
		this.stopShake(this.restorePositionOnFinish);
	}

	public playShake(duration: number = this.duration, strength: number = this.strength, vibrato: number = this.vibrato): void
	{
		this.captureInitialPosition();
		this.stopShake(false);

		const stepCount = Math.max(1, Math.floor(vibrato));
		const stepDuration = duration / (stepCount + 1);
		const sequence = tween(this.node);

		this._isShaking = true;

		for (let index = 0; index < stepCount; index++)
		{
			const damping = 1 - index / stepCount;
			const offset = new Vec3(
				this._initialPosition.x + this.randomOffset(strength * damping),
				this._initialPosition.y + this.randomOffset(strength * damping),
				this._initialPosition.z
			);

			sequence.to(stepDuration, { position: offset }, { easing: easing.smooth });
		}

		sequence
			.to(stepDuration, { position: this._cachedInitialPosition }, { easing: easing.smooth })
			.call(() => {
				this._isShaking = false;
				if (this.restorePositionOnFinish)
				{
					this.resetPosition();
				}
			})
			.start();
	}

	public stopShake(restorePosition: boolean = true): void
	{
		Tween.stopAllByTarget(this.node);
		this._isShaking = false;

		if (restorePosition)
		{
			this.resetPosition();
		}
	}

	public resetPosition(): void
	{
		this.node.setPosition(this._initialPosition);
	}

	public get isShaking(): boolean
	{
		return this._isShaking;
	}

	private captureInitialPosition(): void
	{
		this._initialPosition.set(Vec3.ZERO);
		this._cachedInitialPosition.set(this.node.position);
	}

	private randomOffset(strength: number): number
	{
		return (Math.random() * 2 - 1) * strength;
	}
}


