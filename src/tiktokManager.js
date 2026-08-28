import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { EventEmitter } from 'events';

/**
 * TikTokManager нормализира суровите събития от tiktok-live-connector
 * в едно единно 'event' събитие с ясен type/payload, който TTS и overlay-a
 * могат да ползват без да знаят детайли за библиотеката отдолу.
 */
class TikTokManager extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.username = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.likeAccumulator = 0;
  }

  getStatus() {
    return {
      connected: this.connected,
      username: this.username,
      roomId: this.connection?.roomId || null
    };
  }

  async connect(username) {
    if (this.connection && this.connected) {
      await this.disconnect();
    }

    const clean = username.replace('@', '').trim();
    this.username = clean;
    this.connection = new TikTokLiveConnection(clean, {
      enableExtendedGiftInfo: true,
      // signApiKey: process.env.EULER_API_KEY, // задай в .env ако имаш Euler Stream ключ
    });

    this._bindEvents();

    const state = await this.connection.connect();
    this.connected = true;
    this.emit('status', this.getStatus());
    return state;
  }

  async disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.connection) {
      try { await this.connection.disconnect(); } catch { /* noop */ }
    }
    this.connected = false;
    this.emit('status', this.getStatus());
  }

  _bindEvents() {
    const c = this.connection;

    c.on(ControlEvent.CONNECTED, (state) => {
      this.connected = true;
      this.emit('status', this.getStatus());
      this.emit('log', { level: 'success', message: `Свързан към стая ${state.roomId}` });
    });

    c.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
      this.connected = false;
      this.emit('status', this.getStatus());
      this.emit('log', { level: 'warn', message: `Прекъсната връзка (${code}) ${reason || ''}` });
      this._scheduleReconnect();
    });

    c.on(ControlEvent.ERROR, ({ info, exception }) => {
      this.emit('log', { level: 'error', message: `Грешка: ${info} ${exception?.message || ''}` });
    });

    c.on(WebcastEvent.CHAT, (data) => {
      this.emit('event', {
        type: 'chat',
        user: data.user?.nickname || data.user?.uniqueId || 'Зрител',
        uniqueId: data.user?.uniqueId,
        message: data.comment,
        raw: data
      });
    });

    c.on(WebcastEvent.GIFT, (data) => {
      const giftType = data.giftDetails?.giftType;
      const streakInProgress = giftType === 1 && !data.repeatEnd;
      if (streakInProgress) return; // изчакваме края на streak-а, за да не спамим TTS

      this.emit('event', {
        type: 'gift',
        user: data.user?.nickname || data.user?.uniqueId || 'Зрител',
        uniqueId: data.user?.uniqueId,
        giftName: data.giftDetails?.giftName || `подарък #${data.giftId}`,
        count: data.repeatCount || 1,
        coins: (data.giftDetails?.diamondCount || 0) * (data.repeatCount || 1),
        raw: data
      });
    });

    c.on(WebcastEvent.FOLLOW, (data) => {
      this.emit('event', {
        type: 'follow',
        user: data.user?.nickname || data.user?.uniqueId || 'Зрител',
        uniqueId: data.user?.uniqueId,
        raw: data
      });
    });

    c.on(WebcastEvent.SHARE, (data) => {
      this.emit('event', {
        type: 'share',
        user: data.user?.nickname || data.user?.uniqueId || 'Зрител',
        uniqueId: data.user?.uniqueId,
        raw: data
      });
    });

    c.on(WebcastEvent.MEMBER, (data) => {
      this.emit('event', {
        type: 'member',
        user: data.user?.nickname || data.user?.uniqueId || 'Зрител',
        uniqueId: data.user?.uniqueId,
        viewerCount: data.memberCount,
        raw: data
      });
    });

    c.on(WebcastEvent.LIKE, (data) => {
      this.likeAccumulator += data.likeCount || 0;
      this.emit('event', {
        type: 'like',
        user: data.user?.nickname || data.user?.uniqueId || 'Зрител',
        uniqueId: data.user?.uniqueId,
        likeCount: data.likeCount,
        totalLikeCount: data.totalLikeCount,
        accumulated: this.likeAccumulator,
        raw: data
      });
    });

    c.on(WebcastEvent.ROOM_USER, (data) => {
      this.emit('event', {
        type: 'roomUser',
        viewerCount: data.viewerCount,
        raw: data
      });
    });
  }

  _scheduleReconnect() {
    if (!this.username) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      try {
        this.emit('log', { level: 'info', message: 'Опит за автоматично повторно свързване...' });
        await this.connect(this.username);
      } catch (err) {
        this.emit('log', { level: 'error', message: `Неуспешно reconnect: ${err.message}` });
        this._scheduleReconnect();
      }
    }, 8000);
  }
}

export const tiktokManager = new TikTokManager();
