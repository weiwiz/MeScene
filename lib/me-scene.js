/**
 * Created by jacky on 2017/2/4.
 */
'use strict';
var util = require('util');
var uuid = require('node-uuid');
var logger = require('./mlogger/mlogger');
var async = require('async');
var VirtualDevice = require('./virtual-device').VirtualDevice;
var OPERATION_SCHEMAS = {
    get: {
        "type": "object",
        "properties": {
            "deviceId": {"type": "string"},
            "sceneId": {"type": "string"}
        },
        "required": ["deviceId", "sceneId"]
    },
    update: {
        "type": "object",
        "properties": {
            "deviceId": {
                "type": "string"
            },
            "sceneId": {
                "type": "string"
            },
            "scene": {
                "type": "object",
                "properties": {
                    "sceneId": {
                        "type": "string"
                    },
                    "name": {
                        "type": "string"
                    },
                    "description": {
                        "type": "string"
                    },
                    "type": {
                        "type": "string"
                    },
                    "notify": {
                        "type": "boolean"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["PARALLEL", "SERIES", "WATERFALL"]
                    },
                    "cmds": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "uuid": {
                                    "type": "string"
                                },
                                "deviceType": {
                                    "type": "string"
                                },
                                "cmd": {
                                    "type": "object",
                                    "properties": {
                                        "cmdName": {
                                            "type": "string"
                                        },
                                        "cmdCode": {
                                            "type": "string"
                                        },
                                        "parameters": {
                                            "type": ["object", "string", "array"]
                                        }
                                    },
                                    "required": ["cmdName", "cmdCode", "parameters"]
                                }
                            }
                        }
                    }
                },
                "required": ["sceneId", "name", "mode", "description", "type", "commands"]
            }
        },
        "required": ["deviceId", "scene"]
    },
    delete: {
        "type": "object",
        "properties": {
            "deviceId": {"type": "string"},
            "sceneId": {"type": "string"}
        },
        "required": ["deviceId", "sceneId"]
    },
    add: {
        "type": "object",
        "properties": {
            "deviceId": {
                "type": "string"
            },
            "scene": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["PARALLEL", "SERIES", "WATERFALL"]
                    },
                    "description": {
                        "type": "string"
                    },
                    "type": {
                        "type": "string"
                    },
                    "notify": {
                        "type": "boolean"
                    },
                    "commands": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "uuid": {
                                    "type": "string"
                                },
                                "deviceType": {
                                    "type": "string"
                                },
                                "cmd": {
                                    "type": "object",
                                    "properties": {
                                        "cmdName": {
                                            "type": "string"
                                        },
                                        "cmdCode": {
                                            "type": "string"
                                        },
                                        "parameters": {
                                            "type": ["object", "string", "array"]
                                        }
                                    },
                                    "required": ["cmdName", "cmdCode", "parameters"]
                                }
                            }
                        }
                    }
                },
                "required": ["name", "mode", "description", "type", "commands"]
            }
        },
        "required": ["deviceId", "scene"]
    },
    action: {
        "type": "object",
        "properties": {
            "deviceId": {"type": "string"},
            "sceneId": {"type": "string"}
        },
        "required": ["deviceId", "sceneId"]
    },
    settings: {
        "type": "object",
        "properties": {
            "deviceId": {"type": "string"},
            "sceneId": {"type": "string"},
            "settings":{
                "type": "object",
                "properties":{
                    "notify": {"type": "boolean"}
                },
                "required": ["notify"]
            }
        },
        "required": ["deviceId", "sceneId", "settings"]
    }
};

function Scene(conx, uuid, token, configurator) {
    VirtualDevice.call(this, conx, uuid, token, configurator);
}
util.inherits(Scene, VirtualDevice);

/**
 * 远程RPC回调函数
 * @callback onMessage~get
 * @param {object} response:
 * {
 *      "retCode":{number},
 *      "description":{string},
 *      "data":{object}
 * }
 */
/**
 * 查询定时器
 * @param {object} message :消息体
 * @param {onMessage~get} peerCallback: 远程RPC回调函数
 * */
Scene.prototype.get = function (message, peerCallback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.get, function (error) {
        if (error) {
            responseMessage = error;
            peerCallback(error);
        }
        else {
            async.waterfall([
                /*get device info*/
                function (innerCallback) {
                    var msg = {
                        devices: self.configurator.getConfRandom("services.device_manager"),
                        payload: {
                            cmdName: "getDevice",
                            cmdCode: "0003",
                            parameters: {
                                uuid: message.deviceId
                            }
                        }
                    };
                    self.message(msg, function (response) {
                        if (response.retCode === 200) {
                            var deviceInfo = response.data;
                            if (util.isArray(response.data)) {
                                deviceInfo = response.data[0];
                            }
                            innerCallback(null, deviceInfo);
                        } else {
                            innerCallback({errorId: response.retCode, errorMsg: response.description});
                        }
                    });
                },
                function (deviceInfo, innerCallback) {
                    if (message.sceneId === "*") {
                        responseMessage.data = deviceInfo.extra.scenes;
                        if (util.isNullOrUndefined(responseMessage.data)) {
                            responseMessage.data = []
                        }
                        innerCallback(null);
                    }
                    else {
                        var scene = null;
                        if (!util.isNullOrUndefined(deviceInfo.extra) && !util.isNullOrUndefined(deviceInfo.extra.scenes)) {
                            for (var index = 0, length = deviceInfo.extra.scenes.length; index < length; index++) {
                                if (deviceInfo.extra.scenes[index].sceneId === message.sceneId) {
                                    scene = deviceInfo.extra.scenes[index];
                                    break;
                                }
                            }
                        }

                        if (scene) {
                            responseMessage.data = scene;
                            innerCallback(null);
                        }
                        else {
                            innerCallback({
                                errorId: 208001,
                                errorMsg: "no scene found by given uuid:[" + message.sceneId + "]"
                            });
                        }
                    }
                }
            ], function (error) {
                if (error) {
                    responseMessage.retCode = error.errorId;
                    responseMessage.description = error.errorMsg;
                }
                peerCallback(responseMessage);
            });
        }
    });
};

/**
 * 远程RPC回调函数
 * @callback onMessage~update
 * @param {object} response:
 * {
 *      "retCode":{number},
 *      "description":{string},
 *      "data":{object}
 * }
 */
/**
 * 更新定时器
 * @param {object} message :消息体
 * @param {onMessage~update} peerCallback: 远程RPC回调函数
 * */
Scene.prototype.update = function (message, peerCallback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.update, function (error) {
        if (error) {
            responseMessage = error;
            peerCallback(error);
        }
        else {
            async.waterfall([
                /*get device info*/
                function (innerCallback) {
                    var msg = {
                        devices: self.configurator.getConfRandom("services.device_manager"),
                        payload: {
                            cmdName: "getDevice",
                            cmdCode: "0003",
                            parameters: {
                                uuid: message.deviceId
                            }
                        }
                    };
                    self.message(msg, function (response) {
                        if (response.retCode === 200) {
                            var deviceInfo = response.data;
                            if (util.isArray(response.data)) {
                                deviceInfo = response.data[0];
                            }
                            innerCallback(null, deviceInfo);
                        } else {
                            innerCallback({errorId: response.retCode, errorMsg: response.description});
                        }
                    });
                },
                function (deviceInfo, innerCallback) {
                    var foundFlag = false;
                    if (!util.isNullOrUndefined(deviceInfo.extra) && !util.isNullOrUndefined(deviceInfo.extra.scenes)) {
                        for (var index = 0, length = deviceInfo.extra.scenes.length; index < length; index++) {
                            if (deviceInfo.extra.scenes[index].sceneId === message.sceneId) {
                                deviceInfo.extra.scenes[index] = message.scene;
                                foundFlag = true;
                                break;
                            }
                        }
                    }
                    if (!foundFlag) {
                        innerCallback({
                            errorId: 208001,
                            errorMsg: "no scene found by given uuid:[" + message.sceneId + "]"
                        });
                    }
                    else {
                        var msg = {
                            devices: self.configurator.getConfRandom("services.device_manager"),
                            payload: {
                                cmdName: "deviceUpdate",
                                cmdCode: "0004",
                                parameters: {
                                    "uuid": deviceInfo.uuid,
                                    "extra.scenes": deviceInfo.extra.scenes
                                }
                            }
                        };
                        self.message(msg, function (response) {
                            if (response.retCode !== 200) {
                                innerCallback({errorId: response.retCode, errorMsg: response.description});
                            } else {
                                innerCallback(null);
                            }
                        });
                    }
                }
            ], function (error) {
                if (error) {
                    responseMessage.retCode = error.errorId;
                    responseMessage.description = error.errorMsg;
                }
                peerCallback(responseMessage);
            });
        }
    });
};

/**
 * 远程RPC回调函数
 * @callback onMessage~delete
 * @param {object} response:
 * {
 *      "retCode":{number},
 *      "description":{string},
 *      "data":{object}
 * }
 */
/**
 * 删除定时器
 * @param {object} message :消息体
 * @param {onMessage~delete} peerCallback: 远程RPC回调函数
 * */
Scene.prototype.delete = function (message, peerCallback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.delete, function (error) {
        if (error) {
            responseMessage = error;
            peerCallback(error);
        }
        else {
            async.waterfall([
                /*get device info*/
                function (innerCallback) {
                    var msg = {
                        devices: self.configurator.getConfRandom("services.device_manager"),
                        payload: {
                            cmdName: "getDevice",
                            cmdCode: "0003",
                            parameters: {
                                uuid: message.deviceId
                            }
                        }
                    };
                    self.message(msg, function (response) {
                        if (response.retCode === 200) {
                            var deviceInfo = response.data;
                            if (util.isArray(response.data)) {
                                deviceInfo = response.data[0];
                            }
                            innerCallback(null, deviceInfo);
                        } else {
                            innerCallback({errorId: response.retCode, errorMsg: response.description});
                        }
                    });
                },
                function (deviceInfo, innerCallback) {
                    var foundFlag = false;
                    if (!util.isNullOrUndefined(deviceInfo.extra) && !util.isNullOrUndefined(deviceInfo.extra.scenes)) {
                        for (var index = 0, length = deviceInfo.extra.scenes.length; index < length; index++) {
                            if (deviceInfo.extra.scenes[index].sceneId === message.sceneId) {
                                deviceInfo.extra.scenes.splice(index, 1);
                                foundFlag = true;
                                break;
                            }
                        }
                    }
                    if (!foundFlag) {
                        innerCallback({
                            errorId: 208001,
                            errorMsg: "no scene found by given uuid:[" + message.sceneId + "]"
                        });
                    }
                    else {
                        var msg = {
                            devices: self.configurator.getConfRandom("services.device_manager"),
                            payload: {
                                cmdName: "deviceUpdate",
                                cmdCode: "0004",
                                parameters: {
                                    "uuid": deviceInfo.uuid,
                                    "extra.scenes": deviceInfo.extra.scenes
                                }
                            }
                        };
                        self.message(msg, function (response) {
                            if (response.retCode !== 200) {
                                innerCallback({errorId: response.retCode, errorMsg: response.description});
                            } else {
                                innerCallback(null);
                            }
                        });
                    }
                }
            ], function (error) {
                if (error) {
                    responseMessage.retCode = error.errorId;
                    responseMessage.description = error.errorMsg;
                }
                peerCallback(responseMessage);
            });
        }
    });
};

/**
 * 远程RPC回调函数
 * @callback onMessage~add
 * @param {object} response:
 * {
 *      "retCode":{number},
 *      "description":{string},
 *      "data":{object}
 * }
 */
/**
 * 添加定时器
 * @param {object} message :消息体
 * @param {onMessage~add} peerCallback: 远程RPC回调函数
 * */
Scene.prototype.add = function (message, peerCallback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.add, function (error) {
        if (error) {
            responseMessage = error;
            peerCallback(error);
        }
        else {
            async.waterfall([
                /*get device info*/
                function (innerCallback) {
                    var msg = {
                        devices: self.configurator.getConfRandom("services.device_manager"),
                        payload: {
                            cmdName: "getDevice",
                            cmdCode: "0003",
                            parameters: {
                                uuid: message.deviceId
                            }
                        }
                    };
                    self.message(msg, function (response) {
                        if (response.retCode === 200) {
                            var deviceInfo = response.data;
                            if (util.isArray(response.data)) {
                                deviceInfo = response.data[0];
                            }
                            innerCallback(null, deviceInfo);
                        } else {
                            innerCallback({errorId: response.retCode, errorMsg: response.description});
                        }
                    });
                },
                function (deviceInfo, innerCallback) {
                    var sceneId = uuid.v4();
                    message.scene.sceneId = sceneId;
                    if (util.isNullOrUndefined(deviceInfo.extra.scenes)) {
                        deviceInfo.extra.scenes = [];
                    }
                    deviceInfo.extra.scenes.push(message.scene);
                    var msg = {
                        devices: self.configurator.getConfRandom("services.device_manager"),
                        payload: {
                            cmdName: "deviceUpdate",
                            cmdCode: "0004",
                            parameters: {
                                "uuid": deviceInfo.uuid,
                                "extra.scenes": deviceInfo.extra.scenes
                            }
                        }
                    };
                    self.message(msg, function (response) {
                        if (response.retCode !== 200) {
                            innerCallback({errorId: response.retCode, errorMsg: response.description});
                        } else {
                            innerCallback(null, sceneId);
                        }
                    });
                }
            ], function (error, sceneId) {
                if (error) {
                    responseMessage.retCode = error.errorId;
                    responseMessage.description = error.errorMsg;
                }
                else {
                    responseMessage.data = sceneId;
                }
                peerCallback(responseMessage);
            });
        }
    });
};

/**
 * 远程RPC回调函数
 * @callback onMessage~action
 * @param {object} response:
 * {
 *      "retCode":{number},
 *      "description":{string},
 *      "data":{object}
 * }
 */
/**
 * 添加定时器
 * @param {object} message :消息体
 * @param {onMessage~action} peerCallback: 远程RPC回调函数
 * */
Scene.prototype.action = function (message, peerCallback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.action, function (error) {
        if (error) {
            responseMessage = error;
            peerCallback(error);
        }
        else {
            async.waterfall([
                /*get device info*/
                function (innerCallback) {
                    var msg = {
                        devices: self.configurator.getConfRandom("services.device_manager"),
                        payload: {
                            cmdName: "getDevice",
                            cmdCode: "0003",
                            parameters: {
                                uuid: message.deviceId
                            }
                        }
                    };
                    self.message(msg, function (response) {
                        if (response.retCode === 200) {
                            var deviceInfo = response.data;
                            if (util.isArray(response.data)) {
                                deviceInfo = response.data[0];
                            }
                            innerCallback(null, deviceInfo);
                        } else {
                            innerCallback({errorId: response.retCode, errorMsg: response.description});
                        }
                    });
                },
                function (deviceInfo, innerCallback) {
                    var scene = null;
                    if (!util.isNullOrUndefined(deviceInfo.extra) && !util.isNullOrUndefined(deviceInfo.extra.scenes)) {
                        for (var index = 0, length = deviceInfo.extra.scenes.length; index < length; index++) {
                            if (deviceInfo.extra.scenes[index].sceneId === message.sceneId) {
                                scene = deviceInfo.extra.scenes[index];
                                break;
                            }
                        }
                    }
                    if (scene) {
                        if (scene.mode === "PARALLEL" && util.isArray(scene.commands)) {
                            for (var i = 0, len = scene.commands.length; i < len; ++i) {
                                var msg = {
                                    devices: deviceInfo.owner,
                                    payload: {
                                        cmdName: "forward",
                                        cmdCode: "0001",
                                        parameters: scene.commands[i]
                                    }
                                };
                                self.message(msg, function (response) {
                                    if (response.retCode !== 200) {
                                        logger.error(response.retCode, response.description);
                                    }
                                });
                            }
                            innerCallback(null);
                        }
                        else if (scene.mode === "WATERFALL") {
                            //todo
                            innerCallback(null);
                        }
                        else if (scene.mode === "SERIES") {
                            //todo
                            innerCallback(null);
                        }
                    }
                    else {
                        innerCallback({
                            errorId: 208001,
                            errorMsg: "no scene found by given uuid:[" + message.sceneId + "]"
                        });
                    }
                }
            ], function (error) {
                if (error) {
                    responseMessage.retCode = error.errorId;
                    responseMessage.description = error.errorMsg;
                }
                peerCallback(responseMessage);
            });
        }
    });

};
/**
 * 远程RPC回调函数
 * @callback onMessage~settings
 * @param {object} response:
 * {
 *      "retCode":{number},
 *      "description":{string},
 *      "data":{object}
 * }
 */
/**
 * 删除定时器
 * @param {object} message :消息体
 * @param {onMessage~settings} peerCallback: 远程RPC回调函数
 * */
Scene.prototype.settings = function (message, peerCallback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.settings, function (error) {
        if (error) {
            responseMessage = error;
            peerCallback(error);
        }
        else {
            async.waterfall([
                /*get device info*/
                function (innerCallback) {
                    var msg = {
                        devices: self.configurator.getConfRandom("services.device_manager"),
                        payload: {
                            cmdName: "getDevice",
                            cmdCode: "0003",
                            parameters: {
                                uuid: message.deviceId
                            }
                        }
                    };
                    self.message(msg, function (response) {
                        if (response.retCode === 200) {
                            var deviceInfo = response.data;
                            if (util.isArray(response.data)) {
                                deviceInfo = response.data[0];
                            }
                            innerCallback(null, deviceInfo);
                        } else {
                            innerCallback({errorId: response.retCode, errorMsg: response.description});
                        }
                    });
                },
                function (deviceInfo, innerCallback) {
                    var foundFlag = false;
                    if (!util.isNullOrUndefined(deviceInfo.extra) && !util.isNullOrUndefined(deviceInfo.extra.scenes)) {
                        for (var index = 0, length = deviceInfo.extra.scenes.length; index < length; index++) {
                            if (deviceInfo.extra.scenes[index].sceneId === message.sceneId) {
                                deviceInfo.extra.scenes[index].notify = message.settings.notify;
                                foundFlag = true;
                                break;
                            }
                        }
                    }
                    if (!foundFlag) {
                        innerCallback({
                            errorId: 208001,
                            errorMsg: "no scene found by given uuid:[" + message.sceneId + "]"
                        });
                    }
                    else {
                        var msg = {
                            devices: self.configurator.getConfRandom("services.device_manager"),
                            payload: {
                                cmdName: "deviceUpdate",
                                cmdCode: "0004",
                                parameters: {
                                    "uuid": deviceInfo.uuid,
                                    "extra.scenes": deviceInfo.extra.scenes
                                }
                            }
                        };
                        self.message(msg, function (response) {
                            if (response.retCode !== 200) {
                                innerCallback({errorId: response.retCode, errorMsg: response.description});
                            } else {
                                innerCallback(null);
                            }
                        });
                    }
                }
            ], function (error) {
                if (error) {
                    responseMessage.retCode = error.errorId;
                    responseMessage.description = error.errorMsg;
                }
                peerCallback(responseMessage);
            });
        }
    });
};
module.exports = {
    Service: Scene,
    OperationSchemas: OPERATION_SCHEMAS
};