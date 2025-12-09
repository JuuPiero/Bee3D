import { _decorator, Component } from 'cc';
interface ISingletonCtor<T> {
    new (): T;
    instanceID: string;
}
export abstract class SingletonInSceneComponent extends Component {
    public static instanceID: string;
    //Các lớp con dùng chung phương thức tĩnh
    private static _instances: Map<string, any> = new Map();
    public static Instance<T>(this: new () => T): T {
        const instanceId: string = (this as ISingletonCtor<T>).instanceID;

        if (!instanceId) 
            throw new Error("Instance ID not define!");
        if (!SingletonInSceneComponent._instances.has(instanceId)) 
            throw new Error("Singleton hasn't been initialized!");

        return SingletonInSceneComponent._instances.get(instanceId) as T;
    }
    private _SetInstance(): void {
        const instanceId: string = (this.constructor as ISingletonCtor<any>).instanceID;
        if (!instanceId) 
            throw new Error("Instance ID not define!");

        if (!SingletonInSceneComponent._instances.has(instanceId)) {
            SingletonInSceneComponent._instances.set(instanceId, this);
        } else {
            //Nếu đã tồn tại instance => destroy
            this.node.destroy();
        }
    }
    protected __preload(): void {
        this._SetInstance();
    }
}