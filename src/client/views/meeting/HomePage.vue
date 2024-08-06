<template>
  <div class="home-page">
    <div class="user-list-content">
      <el-card class="user-list-card">
        <div slot="header" class="user-list-header">
          用户列表
        </div>
        <div class="user-list">
          <ul v-for="(item,index) in userList" :key="index">
            <el-tag size="small" type="success">
              {{`用户: ${item.nickname}`}}
              <span v-if="userInfo.userId === item.userId">(我)</span>
            </el-tag>
            <el-button size="small" type="primary" v-if="userInfo.userId !== item.userId" @click="call(item)">通话</el-button>
            <el-button v-if="userInfo.userId === item.userId" size="small" type="danger" @click="openVideoOrNot">切换音视频</el-button>
            <el-button v-if="userInfo.userId === item.userId" size="small" type="danger" @click="changeCamera">切换摄像头</el-button>
          </ul>
        </div>
      </el-card>
    </div>
    <div class="video-content">
      <div class="remote-video">
        <video id="remoteVideo01" autoplay muted playsinline></video>
      </div>
      <div class="local-video">
        <video id="localdemo01" autoplay muted playsinline></video>
      </div>
    </div>
    <div class="message-content">
      <el-form  :model="formInline" label-width="250px" class="demo-form-inline">
        <el-form-item label="发送消息">
          <el-input v-model="formInline.rtcmessage"  placeholder="消息"></el-input>
        </el-form-item>
        <el-form-item label="远端消息">
          <div>{{formInline.rtcmessageRes}}</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="sendMessageUserRtcChannel">点击发送</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { ref, onUnmounted } from "vue";
import { io, Socket } from 'socket.io-client'
import {getLocalUserMedia, getShareMedia, setDomVideoStream, setRemoteDomVideoStream} from "@/utils";

interface UserInfo {
  roomId: string;
  userId: string;
  nickname: string;
}

const route = useRoute()
console.log('route', route)

const formInline = ref({
  rtcmessage: '',
  rtcmessageRes: '',//响应
})

const userInfo = ref<UserInfo>({
  roomId: '',
  userId: '',
  nickname: '',
})

let socketClient: Socket
let channel: RTCDataChannel

const userList = ref<{ roomId:string; userId: string; nickname: string }[]>([])

let localRtcPc: RTCPeerConnection

const changeCamera = async () => {
  let stream = await getShareMedia()
  const senders = localRtcPc.getSenders()
  if (stream) {
    const [videoTrack] = stream.getVideoTracks();
    const send = senders.find((s) => s.track?.kind === 'video')//找到视频类型发送方信息
    if (send) {
      send.replaceTrack(videoTrack) //替换视频媒体信息
    }
  }
}

const openVideoOrNot = () => {
  const senders = localRtcPc.getSenders()
  const send = senders.find(sender => sender.track?.kind === 'video')

  if (send && send.track) {
    send.track.enabled = !send.track.enabled
  }
}

const sendMessageUserRtcChannel = () => {
  channel.send(formInline.value.rtcmessage)
}

const onPcEvent = (pc: RTCPeerConnection, localUid: string, remoteUid: string) => {
  channel = pc.createDataChannel('chat')
  pc.ontrack = (e) => {
    setRemoteDomVideoStream('remoteVideo01', e.track)
  }
  pc.onnegotiationneeded = (e) => {
    console.log('onnegotiationneeded 重新协商: ', e)
  }
  pc.ondatachannel = (e) => {
    console.log('Data channel is created!');
    e.channel.onopen = () => {
      console.log('Data channel is open and ready to be used.');
    };
    e.channel.onmessage = (e) => {
      console.log('Data channel received a message:', e.data);
      formInline.value.rtcmessageRes = e.data
    };
    e.channel.onclose = () => {
      console.log('Data channel is closed.');
    };
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      let params = {
        targetUid: remoteUid,
        userId: localUid,
        candidate: e.candidate
      }
      socketClient.emit('candidate', params)
    } else {
      // 在此次协商中，没有更多的候选了
      console.log("在此次协商中，没有更多的候选了")
    }
  }
}

const initCallerInfo = async (callerId: string, calleeId: string) => {
  // 初始化 pc
  localRtcPc = new RTCPeerConnection()
  // 获取本地媒体并添加到 pc 中
  let localStream = await getLocalUserMedia({ video: true, audio: true })
  for (const track of localStream.getTracks()) {
    localRtcPc.addTrack(track)
  }
  // 本地 dom 渲染
  await setDomVideoStream('localdemo01', localStream)
  // 回调监听（初始化回调信息，比如 ontrack（监听B端媒体），onicecandidate（双方 ICE 候选信息）事件等）
  onPcEvent(localRtcPc, callerId, calleeId)
  // 创建 offer
  let offer = await localRtcPc.createOffer()
  // 设置 offer 为本地描述
  await localRtcPc.setLocalDescription(offer)
  // 发送 offer 给被呼叫端
  let params = {
    targetUid: calleeId,
    userId: callerId,
    offer
  }
  socketClient.emit('offer', params)
}

const initCalleeInfo = async (localUid: string, fromUid: string) => {
  // 初始化 pc
  localRtcPc = new RTCPeerConnection()
  // 初始化本地媒体信息
  let localStream = await getLocalUserMedia({video: true, audio: true})
  for (const track of localStream.getTracks()) {
    localRtcPc.addTrack(track)
  }
  // 本地 dom 渲染
  await setDomVideoStream('localdemo01', localStream)
  // 回调监听（初始化回调信息，比如 ontrack（监听B端媒体），onicecandidate（双方 ICE 候选信息）事件等）
  onPcEvent(localRtcPc, localUid, fromUid)
}

const onRemoteAnswer = async (fromUid: string, answer: RTCSessionDescriptionInit) => {
  await localRtcPc.setRemoteDescription(answer)
}

const onRemoteOffer = async (fromUid: string, offer: RTCSessionDescriptionInit) => {
  // B 接受到 A 的 offer 设置为 remote desc
  await localRtcPc.setRemoteDescription(offer)
  // 创建应答
  let answer = await localRtcPc.createAnswer()
  // 设置为local desc
  await localRtcPc.setLocalDescription(answer)
  // 通过信令服务器发送给A
  let params = {
    targetUid: fromUid,
    userId: userInfo.value.userId,
    answer
  }
  socketClient.emit('answer', params)
}

const onCall = async (e) => {
  console.log('onCall 远端呼叫: ', e)
  await initCalleeInfo(e.data.targetUid, e.data.userId)
}

const call = async (user: UserInfo) => {
  let params = {
    roomId: userInfo.value.roomId,
    userId: userInfo.value.userId,
    targetUid: user.userId,
  }

  console.log('call params: ', params)

  socketClient.emit('call', params)
  await initCallerInfo(params.userId, params.targetUid)
}

const initSocket = (roomId: string, userId: string, nickname = userId) => {
  socketClient = io('http://localhost:18080', {
    reconnectionDelayMax: 10000,
    transports: ['websocket'],
    query: {
      roomId,
      userId,
      nickname,
    }
  })

  socketClient.on('connect', () => {
    console.log('socket connected')
  })

  socketClient.on('disconnect', () => {
    console.log('socket disconnected')
  })

  socketClient.on('error', (error) => {
    console.error('socket error', error)
  })

  socketClient.on('message', async (message) => {
    console.log('socket message', message)
    let type = message.type
    if (type === 'join' || type === 'leave') {
      setTimeout(() => {
        let params = { roomId }
        socketClient.emit('roomUserList', params)
      }, 1000)
    }

    if (type === 'call') {
      await onCall(message)
    }

    if (type === 'offer') {
      await onRemoteOffer(message.data.userId, message.data.offer)
    }

    if (type === 'answer') {
      await onRemoteAnswer(message.data.userId, message.data.answer)
    }

    if (type === 'candidate') {
      await localRtcPc.addIceCandidate(message.data.candidate)
    }
  })

  socketClient.on('roomUserList', (data) => {
    console.log('socket roomUserList', data)
    userList.value = data
  })
}

const init = () => {

  const queryParams = route.query

  if (!queryParams || !queryParams.roomId || !queryParams.userId) {
    console.error('缺少必要参数')
    return
  }

  userInfo.value.userId = queryParams.userId as string
  userInfo.value.roomId = queryParams.roomId as string
  userInfo.value.nickname = queryParams.userId as string

  initSocket(userInfo.value.roomId, userInfo.value.userId)

}

init()

onUnmounted(() => {
  socketClient.disconnect()
})
</script>

<style scoped>
.home-page {
  display: flex;
}
.video-content {
  position: relative;
}
.remote-video {
  width: 350px;
  height: 350px;
}
.local-video {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 100px;
  height: 100px;
  z-index: 100;
}
video {
  width: 100%;
  height: 100%;
}
</style>
