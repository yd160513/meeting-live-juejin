# meeting-project-juejin

## 项目介绍

### 先启动 redis 服务

```shell
npm install redis

redis-server
```

### 安装依赖

```shell
npm install
```

### 启动信令服务

```shell
npm run serve
```

### 启动客户端

```shell
npm run dev
```

## 需求

- [x] 通过指定链接(http://localhost:8080/?userId=1001&roomId=10012)进入页面，进入页面后自动连接 socket
- [x] 页面中展示当前在线的人员列表
- [x] 除自己以外的人员列表中的人员，可以通过点击按钮向其发起视频通话
- [x] 通话过程中，可以发送消息
- [x] 通话过程中，自己可以切换摄像头
- [x] 通话过程中，自己可以关闭打开摄像头

### 客户端实现

- [x] 通过 URL 中的 userId 和 roomId 进行连接
- [x] 建立 roomUserList 信令监听，创建 socket 连接后该信令响应所有参会人员信息
- [x] 建立 msg 信令监听，其中会返回视频通话核心信令(call/offer/answer/candidate/disconnect)
- [x] 主叫和被叫双方都创建 dataChannel 用来发送消息
- [x] 通过 replaceTrack 改变发送者的 videoTrack 实现摄像头切换
- [x] 通过改变发送者的 videoTrack 的 enabled 实现摄像头开关

### 信令服务实现

- [x] candidate 信令，将自己的 candidate 信息发送给对方
- [x] offer 信令，将自己的 offer 信息发送给对方
- [x] answer 信令，将自己的 answer 信息发送给对方
- [x] socket 连接之后通知，如果 URL 中有 roomId，则通知所有人，有人加入房间
- [x] call 信令，根据对方 id，向对方发送 call 信令
- [x] disconnect 信令，通知所有人，有人离开房间
- [x] roomUserList 信令，获取会议室人员信息
- [x] message 信令，会中发送消息

### 直播
1. 老师 T 进入后将本地视频渲染到 video 上
2. 学生 S1 进入后和老师 T 建立连接
3. 学生 S2 进入后和老师 T 建立连接
4. 学生 S3 进入后和老师 T 建立连接

## addTrack 和 addTransceiver 的区别
### addTrack 方法
功能: 将媒体轨道（如音频或视频）添加到 RTCPeerConnection。
自动创建 RTCRtpTransceiver: 如果没有预先创建 RTCRtpTransceiver，会自动创建一个新的 RTCRtpTransceiver 并将其与该轨道关联。
适用场景: 适用于简单的媒体流传输场景，不需要对媒体流的传输方向进行精细控制。
使用示例:
```js
const pc = new RTCPeerConnection();
const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
for (const track of localStream.getTracks()) {
pc.addTrack(track, localStream);
}
```
### addTransceiver 方法
功能: 创建一个新的 RTCRtpTransceiver，可以指定媒体类型（如音频或视频）和传输方向（如 sendrecv、sendonly、recvonly）。
灵活性: 更灵活，适用于需要精细控制媒体流传输方向的场景。
轨道添加: 创建的 RTCRtpTransceiver 可以在之后通过 addTrack 方法添加轨道。
使用示例:
```js
const pc = new RTCPeerConnection();
const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
pc.addTrack(localStream.getVideoTracks()[0], localStream);
pc.addTrack(localStream.getAudioTracks()[0], localStream);
```

## 虚拟背景实现流程
1. 获取摄像头画面流。
2. 初始化图像分割工具。
3. 在本地的页面 DOM 中，播放第一步获取到的视频流。
4. 监听视频流播放后，将画面帧发送到图像分割工具处理。
5. 图像分割工具利用机器学习模型，识别画面并分割人体，然后处理得到分割后的蒙版，我们得到蒙版后将背景替换成自己的图片，最后展示到 canvas 。

### 初始化图像分割工具时重要参数
- MIN_DETECTION_CONFIDENCE ：手部检测模型中的最小置信度值，取值区间[0.0, 1.0] 被认为是成功的检测。默认为0.5。
- MIN_TRACKING_CONFIDENCE ： 跟踪模型的最小置信度值，取值区间[0.0, 1.0]，将其设置为更高的值可以提高解决方案的稳健性，但是会带来更高的延迟，默认0.5。

### 如何将虚拟背景流发送到远端
通过 canvas.captureStream(30) 获取 canvas 对应的 stream，再获取 senders 的 video track 并将其通过 replaceTrack 进行替换
```ts
const canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
  const vbMediaStream = canvas.captureStream(30)
  const videoTrack = vbMediaStream.getVideoTracks()[0];
  
  for (const [key, value] of tMap) {
    const sender = value.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      try {
        await sender.replaceTrack(videoTrack);
        console.log('Original track restored successfully');
      } catch (error) {
        console.error('Error restoring original track: ', error);
      }
    }
  }
```
