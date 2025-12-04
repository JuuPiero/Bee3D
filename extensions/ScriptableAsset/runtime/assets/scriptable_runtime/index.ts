import { EDITOR } from "cc/env";
import type { ICreateAssetMenuItemInfo } from "../../../src/interface";
import { Asset, Constructor, js, _decorator, Script, __private } from "cc";


const { serializable, property, ccclass } = _decorator;
if (EDITOR) {
    window.tilEditor = window.tilEditor || {} as any;
}


let menuPathReg = /^([^\x00-\x1F\x7F\s\/]+\/)*[^\x00-\x1F\x7F\s]+$/u;

export namespace bh {
    declare type ScriptableAssetClassDecorator = <Class extends Constructor<ScriptableAsset>>(target: Class) => Class | void;
    /**
     * 标记类为scriptable
     * @param name 
     * @returns 
     */
    export function scriptable(name?: string): ScriptableAssetClassDecorator {
        let cccdec = ccclass(name);
        return function (target) {
            let decedClas = cccdec(target as any);
            if (js.isChildClassOf(decedClas, bh.ScriptableAsset)) {
                // @ts-ignore
                let frame = cc._RF.peek();
                if (frame.uuid) {
                    js._setClassId(frame.uuid, decedClas);
                    // end.prototype["__scriptUuid"] = EditorExtends.UuidUtils.decompressUuid(frame.uuid);
                }
            }
            return decedClas;
        }
    }
    export function scriptableAsset(isArray?: boolean | any, ...args): any;
    /**
     * 用于ScriptableAsset字段的属性装饰器
     */
    export function scriptableAsset(target?, propertyKey?, descriptorOrInitializer?, opt?: Omit<__private._cocos_core_data_decorators_property__IPropertyOptions, "type">): any {
        opt = Object.assign(opt ? opt : {}, { type: bh.ScriptableAsset })
        if (target && propertyKey) {
            // @scriptableAsset
            property(opt)(target, propertyKey, descriptorOrInitializer)
            return undefined;
        } else if (target === undefined) {
            // @scriptableAsset()
            return property(opt);
        } else if (typeof target === "boolean") {
            //  @scriptableAsset(true|false)

            if (target){
                opt = Object.assign(opt ? opt : {}, { type: [bh.ScriptableAsset] })
                return property(opt);
            }
            return property(opt);

        } else {
            //  @scriptableAsset(any)
            return property(opt);
        }

    }
    /**
     * 增加创建ScriptableAsset资源菜单项
     * @param fileName 文件名，如果有会自动生成可用文件名
     * @param menuPath 菜单路径
     * @param desc 描述文本
     * @param order 顺序
     * @returns 
     */
    export function createAssetMenu(fileName: string, menuPath: string, desc?: string, order?: number) {
        return function (ctor: Constructor<Asset> & { __$createAssetMenuItemInfo?: ICreateAssetMenuItemInfo }) {
            // 

            if (!EDITOR) return;
            // console.log(`注册创建资源菜单项,${fileName},${menuPath}`);
            if (ctor.__$createAssetMenuItemInfo) return;

            // 判断继承自ScriptableAsset
            if (!(ctor.prototype instanceof ScriptableAsset)) {
                console.error(`${ctor.name} 不是ScriptableAsset的子类`);
                return;
            }
            // 判断是否符合路径规则 a/b/c,允许中文
            if (!menuPath || !menuPathReg.test(menuPath)) {
                throw new Error("path is not valid");
                return;
            }
            let className = js.getClassName(ctor);
            let classId = js.getClassId(ctor);
            if (!classId || classId.trim() === "") {
                console.warn(`class ${className} has no classId,please use @bh.scriptable first ,
                 like @bh.scriptable("<ClassName>")\nclass TestClass`);
            }
            ctor.__$createAssetMenuItemInfo = {
                fileName,
                menuPath,
                className,
                classId,
                desc,
                order,
                fileExt: ".sasset"
            };
            // 记录一下类名
            let createAssetMenuClassIds = tilEditor.createAssetMenuClassIds;
            if (!createAssetMenuClassIds) {
                tilEditor.createAssetMenuClassIds = createAssetMenuClassIds = [];

            }
            if (!createAssetMenuClassIds.includes(classId)) {
                createAssetMenuClassIds.push(classId);
                EditorExtends.emit("create-asset-menu-added", classId);
            }
            // console.log(`注册创建资源菜单项完成,${className}`, TI.saEditor);
        }
    }
    @ccclass("ScriptableAsset")
    export class ScriptableAsset extends Asset {

        @property({
            displayName: "Script",
            type: Script,
            tooltip: "scriptable_asset_script",
            animatable: false
        })
        private get __scriptAsset(): null { return null; }
        @serializable
        private __scriptUuid;
        public static createInstance(clas?: Constructor<ScriptableAsset>) {
            return clas ? new clas() : new this();
        }
        /**
         * 运行时保存asset，需要有uuid
         * @param asset 
         */
        public static saveAsset(asset: ScriptableAsset) {
            if (EDITOR) {
                if (!asset) console.error(`asset is null`);
                if (!asset.uuid) console.error(`asset uuid is null,please use`)
                Editor.Message.request("asset-db", "save-asset", asset.uuid, EditorExtends.serialize(asset));
            } else {
                console.warn(`env is not in Editor,please use api in Editor`)
            }
        }
        /**
         * 创建指定类型的ScriptableAsset
         * @param assetType 
         * @param filePath 无需后缀
         */
        public static async createAsset(assetType: ScriptableAsset, filePath: string) {
            if (EDITOR) {
                if (!filePath) {
                    console.error(`createAsset path is null`)
                    return;
                }
                let pkgJson = require("../../../package.json");
                let pkgName = pkgJson.name || "scriptable-asset";
                let scriptable_asset_ext = pkgJson.__scriptable_asset_ext || ".asset";
                let url = `db://assets/${filePath}${scriptable_asset_ext}`;
                let uuid = await Editor.Message.request('scene', 'execute-scene-script',
                    {
                        name: pkgName,
                        method: "createScriptableAsset",
                        args: [url, js.getClassName(assetType)]
                    });
                return
            } else {
                console.warn(`env is not in Editor,please use api in Editor`)
            }

        }
        /**
         * 将资源保存到磁盘
         */
        public saveAsset() {
            ScriptableAsset.saveAsset(this);
        }
    }


}


