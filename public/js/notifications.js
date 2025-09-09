class NotificationManager {
  constructor() {
    this.socket = null;
    this.notifications = [];
    this.initialized = false;
  }
  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.bellElement = document.getElementById('notificationBell');
    if (!this.bellElement) {
      console.error('notificationBell element not found!');
      return;
    }
    this.countElement = document.getElementById('notificationCount');
    this.panelElement = document.getElementById('notificationPanel');
    this.listElement = document.getElementById('notificationList');
    this.markAllBtn = document.getElementById('markAllRead');
    this.deleteAllBtn = document.getElementById('deleteAllNotifications');
    this.toastContainer = document.getElementById('toastContainer');

    this.bellElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });
    this.markAllBtn.addEventListener('click', () => this.markAllRead());
    this.deleteAllBtn.addEventListener('click', () => this.deleteAllNotifications());

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.notification-system')) this.closePanel();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePanel();
    });

    this.panelElement.style.position = 'fixed';
    this.panelElement.style.top = '60px';
    this.panelElement.style.right = '20px';
    this.panelElement.style.zIndex = '9999';

    this.loadNotifications();

    this.socket = io();
    this.socket.on('new_notification', (notification) => {
      this.addNotification(notification);
      this.showToast(notification);
      this.playSound();
    });
  }
  async loadNotifications() {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        this.notifications = await res.json();
        this.render();
        this.updateBadge();
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  }
  addNotification(notification) {
    this.notifications.unshift(notification);
    this.render();
    this.updateBadge();
  }
  render() {
    if (!this.notifications.length) {
      this.listElement.innerHTML = '<div class="no-notifications">No notifications yet</div>';
      return;
    }
    this.listElement.innerHTML = this.notifications.map(n => `
      <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}" onclick="notificationManager.markRead('${n.id}')">
        <div class="notification-content">
          <h6>${n.type}</h6>
          <p>${n.message}</p>
          <div class="notification-time">${this.formatTime(n.timestamp)}</div>
        </div>
      </div>
    `).join('');
  }
  updateBadge() {
    const unreadCount = this.notifications.filter(n => !n.read).length;
    this.countElement.textContent = unreadCount;
    if (unreadCount > 0) this.countElement.classList.add('show');
    else this.countElement.classList.remove('show');
  }
  togglePanel() {
    if (this.panelElement.classList.contains('show')) {
      this.closePanel();
    } else {
      this.panelElement.classList.add('show');
      this.panelElement.style.zIndex = '9999';
    }
  }
  closePanel() {
    this.panelElement.classList.remove('show');
  }
  async markRead(id) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      if (res.ok) {
        const note = this.notifications.find(n => n.id === id);
        if (note) {
          note.read = true;
          this.render();
          this.updateBadge();
        }
      }
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  }
  async markAllRead() {
    for (const note of this.notifications.filter(n => !n.read)) {
      await this.markRead(note.id);
    }
  }
  async deleteAllNotifications() {
    try {
      const res = await fetch('/api/notifications/all', { method: 'DELETE' });
      if (res.ok) {
        this.notifications = [];
        this.render();
        this.updateBadge();
      }
    } catch (e) {
      console.error('Failed to delete all notifications:', e);
    }
  }
  showToast(notification) {
    const toastId = `toast-${Date.now()}`;
    const html = `
      <div id="${toastId}" class="toast toast-notification" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="toast-header">
          <i class="fas fa-bell text-success me-2"></i>
          <strong class="me-auto text-success">${notification.type}</strong>
          <small class="text-muted">${this.formatTime(notification.timestamp)}</small>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">${notification.message}</div>
      </div>
    `;
    this.toastContainer.insertAdjacentHTML('beforeend', html);
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, { delay: 60000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  }
  playSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      /* silently fail */
    }
  }
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }
}
const notificationManager = new NotificationManager();
window.notificationManager = notificationManager;
window.addEventListener('load', () => notificationManager.init());
