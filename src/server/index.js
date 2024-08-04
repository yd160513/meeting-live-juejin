import http from 'http'
let httpServer = http.createServer() // 创建 http 服务器
/**
 * 使用 socket.io 模块创建了一个 Socket.IO 服务器实例
 * 将 HTTP 服务器传递给 Socket.IO 服务器，使其能够在同一个端口上监听 WebSocket 连接。
 */
import { Server } from 'socket.io'
let io = new Server(httpServer)

import redis from 'redis'
let redisClient = redis.createClient(6379, '127.0.0.1')

const ROOM_KEY = 'meeting-room::'
let userMap = new Map() // user -> socket

redisClient.on('error', (err) => {
    console.error('redisClient connect Error', err)
})
redisClient.on('connect', () => {
    console.log('redisClient connect Success')
})

io.on('connection', async (socket) => {
    console.log('socket client connected')
    await onListener(socket)
})

httpServer.listen(18080, async () => {
    console.log('服务器启动成功 *:18080');
    await redisClient.connect()
})

// 获取 url 参数
function getParams(url, queryName) {
    let query = decodeURI(url.split('?')[1])
    let vars = query.split("&")
    for (let i = 0; i < vars.length; i++) {
        let pair = vars[i].split("=")
        if (pair[0] === queryName) {
            return pair[1]
        }
    }
    return null
}

// 获取用户信息
async function getUserDetailByUid(userId, roomId) {
    let res = JSON.stringify(({userId, roomId, nickname: userId}))
    console.log('getUserDetailByUid', res)
    return res
}

// 封装消息
function getMsg(type, msg, status = 200, data = null) {
    return { type, msg, status, data }
}

// 一对一通信
async function oneToOne(uid, msg) {
    let socket = userMap.get(uid)
    if (socket) {
        socket.emit('message', msg)
    } else {
        console.log(uid+"用户不在线")
    }
}

// 一对多通信
async function oneToRoomMany(roomId, msg) {
    let uList = await redisClient.hGetAll(ROOM_KEY + roomId)
    for (let uid in uList) {
        await oneToOne(uid, msg)
    }
}

// 获取会议室用户列表
async function getRoomUser(roomId) {
    let res = await redisClient.hGetAll(ROOM_KEY + roomId)
    // 将 res 中的 value 转换为 object
    for (let key in res) {
        res[key] = JSON.parse(res[key])
    }
    console.log('getRoomUser', res)
    return res
}

async function onListener(socket) {
    let url = socket.request.url
    let userId = getParams(url, 'userId')
    let roomId = getParams(url, 'roomId')
    console.log("client uid："+userId+" roomId: "+roomId+" online ")
    userMap.set(userId, socket)

    // room cache
    if (roomId) {
        await redisClient.hSet(ROOM_KEY + roomId, userId, await getUserDetailByUid(userId, roomId))
        await oneToRoomMany(roomId, getMsg('join', userId + 'join the room'))
    }

    // candidate 信令
    socket.on('candidate', async (data) => {
        let targetUid = data.targetUid
        console.log('candidate: ', targetUid, data)
        if (userMap.get(targetUid)) {
            await oneToOne(targetUid, getMsg('candidate', 'ice candidate', 200, data))
        } else {
            console.log(targetUid+ "不在线")
        }
    })

    // offer 信令
    socket.on('offer', async (data) => {
        let targetUid = data.targetUid
        console.log('offer: ', targetUid, data)
        if (userMap.get(targetUid)) {
            await oneToOne(targetUid, getMsg('offer', 'rtc offer', 200, data))
        } else {
            console.log(targetUid+ "不在线")
        }
    })

    // answer 信令
    socket.on('answer', async (data) => {
        let targetUid = data.targetUid
        console.log('answer: ', targetUid, data)
        if (userMap.get(targetUid)) {
            await oneToOne(targetUid, getMsg('answer', 'rtc answer', 200, data))
        } else {
            console.log(targetUid+ "不在线")
        }
    })

    // 呼叫信令
    socket.on('call', async (data) => {
        console.log('call: ', data)
        let targetUid = data.targetUid
        console.log('call: ', targetUid, data)
        if (userMap.get(targetUid)) {
            await oneToOne(targetUid, getMsg('call', '远程呼叫', 200, data))
        } else {
            console.log(targetUid+ "不在线")
        }
    })

    // 用户离开
    socket.on('disconnect', async () => {
        console.log("client uid："+userId+" roomId: "+roomId+" offline ")
        userMap.delete(userId)
        if (roomId) {
            await redisClient.hDel(ROOM_KEY + roomId, userId)
            await oneToRoomMany(roomId, getMsg('leave', userId + 'leave the room'))
        }
    })

    // 会议室人员变动
    socket.on('roomUserList', async (data) => {
        console.log("roomUserList msg", data)
        // 获取会议室人员信息
        socket.emit('roomUserList', await getRoomUser(data.roomId))
    })

    // 会中发送消息
    socket.on('message', async (data) => {
        console.log('msg: ', data)
        await oneToRoomMany(roomId, data)
    })
}
