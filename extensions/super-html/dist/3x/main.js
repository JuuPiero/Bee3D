"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = void 0;
//@ts-ignore
const package_json_1 = __importDefault(require("../../package.json"));
/**
 * @en
 * @zh 为扩展的主进程的注册方法
 */
exports.methods = {
    open_panel() {
        Editor.Panel.open(package_json_1.default.name);
    },
    async turn_off(){
        console.log('NVTHAN');
        //Editor.Panel.open("nvthan.main_panel");

        const type = Editor.Selection.getLastSelectedType();
	    if(type !== 'node') {
		    return;
	    }
	    const uuid = Editor.Selection.getLastSelected(type);
        const node = await Editor.Message.request('scene', 'query-node', uuid);
        const active = node.active;
        Editor.Message.send('scene', 'set-property', {
            "uuid" : uuid,
            "path" : `active`,
            "dump": {
                "type": 'Boolean',
                "value" : false
            }
        });
    },
    async turn_on() {
        console.log('NVTHAN');
        //Editor.Panel.open("nvthan.main_panel");

        const type = Editor.Selection.getLastSelectedType();
	    if(type !== 'node') {
		    return;
	    }
	    const uuid = Editor.Selection.getLastSelected(type);
        const node = await Editor.Message.request('scene', 'query-node', uuid);
        const active = node.active;
        Editor.Message.send('scene', 'set-property', {
            "uuid" : uuid,
            "path" : `active`,
            "dump": {
                "type": 'Boolean',
                "value" : true
            }
        });
    },
    async delete_node() {
        const type = Editor.Selection.getLastSelectedType();
	    if(type !== 'node') {
		    return;
	    }
	    const uuid = Editor.Selection.getLastSelected(type);
        const node = await Editor.Message.request('scene', 'query-node', uuid);
        const active = node.active;
        Editor.Message.send('scene', 'remove-node', {
            "uuid" : uuid,
        });
    }
};
/**
 * @en Hooks triggered after extension loading is complete
 * @zh 扩展加载完成后触发的钩子
 */
const load = function () { };
exports.load = load;
/**
 * @en Hooks triggered after extension uninstallation is complete
 * @zh 扩展卸载完成后触发的钩子
 */
const unload = function () { };
exports.unload = unload;
