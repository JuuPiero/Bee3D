import { _decorator, CCInteger, Component, instantiate, Node, Prefab } from 'cc';
import { ShooterQueue } from '../../configData/LevelData';
import { ILevelController } from '../controllers/ILevelController';
import { ShooterConvey } from './ShooterConvey';
import { ShooterItem } from '../flows/ShooterItem/ShooterItem';
import { Queue } from '../../commons/Queue';
const { ccclass, property } = _decorator;

const CONVEY_GAP: number = 1;

@ccclass('ConveyControllers')
export class ConveyControllers extends Component {

    _levelController: ILevelController;
    @property(Prefab) private conveyPrefab: Prefab;
    @property(CCInteger) private perConveyCacpacity: number = 9; 
    private _conveys: ShooterConvey[] = []

    @property(CCInteger) private conveySpeed: number;

    public init(shooterQueues: ShooterQueue[], level: ILevelController, shooterPrefab: Prefab): void
    {
        this._conveys.length = 0;
        this._levelController = level;
        const shooterQueuesTemp : Queue<ShooterItem>[] = [];
        for (let i = 0; i < shooterQueues.length; i++)
        {
            shooterQueuesTemp[i] = new Queue<ShooterItem>();
            for (let j = 0; j < shooterQueues[i].shooters.length; j++)
            {
                const shooterNode = instantiate(shooterPrefab);
                shooterNode.setParent(this.node);
                const shooterComp = shooterNode.getComponent(ShooterItem);
                shooterComp.init(shooterQueues[i].shooters[j], null, level);
                shooterQueuesTemp[i].enqueue(shooterComp);
            }
        }
        let count = 0;
        let currConvey: ShooterConvey;
        let conveyInShooterList: ShooterItem[] = [];
        for (let i = 0; i < shooterQueuesTemp.length; i++)
        {
            for (let j = 0; j < shooterQueuesTemp[i].size(); i++)
            {
                if (count % this.perConveyCacpacity)
                {
                    if (currConvey)
                        currConvey.init(conveyInShooterList.concat(), this.conveySpeed)
                    const conveyNode = instantiate(this.conveyPrefab)
                    conveyNode.setParent(this.node)
                    conveyNode.setPosition(0, - i * CONVEY_GAP, 0)
                    currConvey = conveyNode.getComponent(ShooterConvey)
                    conveyInShooterList.length = 0;
                }
                const index = count % shooterQueuesTemp.length;
                const shooter = shooterQueuesTemp[index].dequeue();
                conveyInShooterList.push(shooter);
                count++;
            }
        }
    }



}


