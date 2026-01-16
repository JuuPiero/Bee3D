import { _decorator, Component, instantiate, Node, Prefab } from 'cc';
import { Queue } from '../commons/Queue';
const { ccclass, property } = _decorator;

@ccclass('EffectPool')
export class EffectPool extends Component {
	private _pool: Queue<Node>;

	@property(Prefab)
	public effectPrefab: Prefab = null;

	@property([Node])
	public initialEffects: Node[] = [];

	protected start(): void
	{
		this._pool = new Queue<Node>(this.initialEffects);
		for (let i = 0; i < this.initialEffects.length; i++)
		{
			this.initialEffects[i].active = false;
		}
	}

	public getEffect(): Node
	{
		if (this._pool.isEmpty())
		{
			const newEffect = instantiate(this.effectPrefab);
			newEffect.setParent(this.node);
			return newEffect;
		}
		const effect = this._pool.dequeue();
		effect.active = true;
		return effect;
	}

	public returnEffect(effect: Node): void
	{
		effect.active = false;
		this._pool.enqueue(effect);
	}
}


