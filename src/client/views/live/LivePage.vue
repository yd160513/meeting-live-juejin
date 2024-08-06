<script setup lang="ts">
import {getLocalUserMedia, getQueryParams, setDomVideoStream, setRemoteDomVideoStream} from "@/utils";
import {io, type Socket} from "socket.io-client";
import {ref} from "vue";

/**
 * 老师端: http://localhost:5173/live/#?roomId=2016&userId=9999&role=pub&nickname=T
 * 学生端:
 * 1. http://localhost:5173/live/#?roomId=2016&userId=01&nickname=S1
 * 2. http://localhost:5173/live/#?roomId=2016&userId=02&nickname=S2
 * 3. http://localhost:5173/live/#?roomId=2016&userId=03&nickname=S3
 */

// 老师端数据结构
const T = '9999'
const S1 = '01'
const S2 = '02'
const S3 = '03'
const tMap = new Map()
tMap.set(`${T}-${S1}`, new RTCPeerConnection())
tMap.set(`${T}-${S2}`, new RTCPeerConnection())
tMap.set(`${T}-${S3}`, new RTCPeerConnection())

// 学生端数据结构
const sMap:Map<string, RTCPeerConnection> = new Map()
sMap.set(`${S1}-${T}`, new RTCPeerConnection())
sMap.set(`${S2}-${T}`, new RTCPeerConnection())
sMap.set(`${S3}-${T}`, new RTCPeerConnection())

let localRtcPc: RTCPeerConnection
let socketClient: Socket

const userList = ref([])

// 获取链接中的参数，如果是老师端则初始化老师端
const initTeacher = async () => {
  const constraints = {
    video: true,
    audio: true
  }
  // 获取本地媒体流，将其渲染到 video 上
  const localStream = await getLocalUserMedia(constraints)
  await setDomVideoStream('teacher-video', localStream)
}

const initStudent = async () => {
  console.log('初始化学生端')

  // 因为老师端和每一个学生都为了单独的 RTCPeerConnection，所以作为学生端要找到老师端。
  const userId = getQueryParams().get('userId')
  const key = `${userId}-${T}`
  let pc = sMap.get(key)

  if (!pc) {
    pc = new RTCPeerConnection()
    sMap.set(key, pc)
  }

  localRtcPc = pc

  // 设置
  pc.addTransceiver("audio", {direction: "recvonly"});
  pc.addTransceiver("video", {direction: "recvonly"});

  // 建立监听，监听远端发来的 answer 和 icecandidate 等信息
  await onPcEvent(T, userId)

  // 创建 offer 并设置本地描述
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  console.log('send offer: ', offer)
  // 发送 offer 给老师端
  socketClient.emit('offer', {
    targetUid: T,
    userId: userId,
    offer
  })

}

const onPcEvent = async (remoteUid: string, userId: string) => {
  localRtcPc.onicecandidate = (e) => {
    if (e.candidate) {
      const params = {
        targetUid: remoteUid,
        userId,
        candidate: e.candidate
      }
      socketClient.emit('candidate', params)
    } else {
      console.log('在此次协商中，没有更多的候选了')
    }
  }

  localRtcPc.onnegotiationneeded = (e) => {
    console.log('onnegotiationneeded 重新协商: ', e)
  }

  localRtcPc.ontrack = (e) => {
    console.log('ontrack: ', e)
    const role = getQueryParams().get('role')
    if (role === 'pub') {
      setRemoteDomVideoStream('student-video', e.track)
    } else {
      setRemoteDomVideoStream('teacher-video', e.track)
    }
  }
}

/**
 * 收到被叫信令，初始化本端 RTCPeerConnection
 * @param data {
 *       targetUid: T, // 被叫
 *       userId, // 主叫
 *       roomId // 房间号
 *     }
 */
const onCall = async (data) => {
  // 收到远端呼叫信令，根据名称去获取对应的 RTCPeerConnection
  // 这个 demo 中，被叫永远是老师端，所以这里去获取老师端维护的 RTCPeerConnection
  const userId = data.userId
  const key = `${T}-${userId}`
  console.log('key: ', key)
  let pc = tMap.get(key)
  if (!pc) {
    pc = new RTCPeerConnection()
    tMap.set(key, pc)
  }
  localRtcPc = pc

  let localStream = await getLocalUserMedia({video: true, audio: true})
  for (const track of localStream.getTracks()) {
    localRtcPc.addTrack(track)
  }

  // const offer = await pc.createOffer()
  // await pc.setLocalDescription(offer)

  await onPcEvent(data.targetUid, data.userId)

  // const params = {
  //   targetUid: data.userId,
  //   userId: data.targetUid,
  //   offer
  // }
  // socketClient.emit('offer', params)

}

const onRemoteOffer = async (data) => {
  await localRtcPc.setRemoteDescription(data.offer)
  const answer = await localRtcPc.createAnswer()
  await localRtcPc.setLocalDescription(answer)
  const params = {
    targetUid: data.userId,
    userId: data.targetUid,
    answer
  }
  socketClient.emit('answer', params)
}

const onRemoteAnswer = async (data) => {
  await localRtcPc.setRemoteDescription(data.answer)
}

const initSocket = async () => {
  const roomId = getQueryParams().get('roomId')
  const userId = getQueryParams().get('userId')
  const nickname = getQueryParams().get('nickname')
  const role = getQueryParams().get('role')
  console.log('roomId: ', roomId)
  console.log('userId: ', userId)
  console.log('nickname: ', nickname)
  console.log('role: ', role)
  socketClient = io('http://localhost:18080', {
    reconnectionDelayMax: 10000,
    transports: ['websocket'],
    query: {
      roomId,
      userId,
      nickname,
      role
    }
  })

  socketClient.on('connect', () => {
    console.log('socket 连接成功')
  })

  socketClient.on('connect_error', (error) => {
    console.log('socket 连接失败: ', error)
  })

  socketClient.on('disconnect', (reason) => {
    console.log('socket 断开连接: ', reason)
  })

  socketClient.on('error', (error) => {
    console.log('socket 错误: ', error)
  })

  socketClient.on('message', async (message) => {
    console.log('socket message: ', message)
    const type = message.type
    if (type === 'join' || type === 'leave') {
      setTimeout(() => {
        const params = {roomId}
        socketClient.emit('roomUserList', params)
      }, 1000)
    }
    if (type === 'candidate') {
      await localRtcPc.addIceCandidate(message.data.candidate)
    }

    if (type === 'offer') {
      await onRemoteOffer(message.data)
    }

    if (type === 'answer') {
      await onRemoteAnswer(message.data)
    }

    if (type === 'call') {
      /**
       * 收到呼叫信令
       * data: {
       *       targetUid: T, // 被叫
       *       userId, // 主叫
       *       roomId // 房间号
       *     }
       */
      await onCall(message.data)
    }
  })

  socketClient.on('roomUserList', (data) => {
    console.log('socket roomUserList: ', data)
    userList.value = data
  })

}

const init = async () => {

  // 连接信令服务
  await initSocket()

  const userId = getQueryParams().get('userId')
  const roomId = getQueryParams().get('roomId')
  const role = getQueryParams().get('role')
  console.log('角色: ', role)

  // 老师端只将本地画面渲染到 video 上
  if (role === 'pub') {
    // 初始化老师端
    console.log('初始化老师端')
    await initTeacher()
  } else {
    console.log('初始化学生端')
    // 学生端向老师端发起呼叫
    socketClient.emit('call', {
      targetUid: T, // 被叫
      userId, // 主叫
      roomId // 房间号
    })

    await initStudent()
  }
}

init()

</script>

<template>
<div class="live-content">
  <div class="teacher-content">
    老师端
    <video id="teacher-video" muted autoplay playsinline></video>
  </div>
  <div class="student-content">
    学生端
    <video id="student-video" muted autoplay playsinline></video>
  </div>
</div>
</template>

<style scoped>
.teacher-content, .student-content {
  width: 200px;
  height: 200px;
}
video {
  width: 100%;
}
</style>