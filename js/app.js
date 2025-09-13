class LaundryTracker {
    constructor() {
        this.loads = [];
        this.timers = new Map();
        this.notificationPermission = false;
        
        this.init();
    }

    init() {
        this.loadData();
        this.bindEvents();
        this.requestNotificationPermission();
        this.updateDisplay();
        this.startTimerUpdates();
    }

    // Data Management
    loadData() {
        const saved = localStorage.getItem('laundryTracker');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.loads = data.loads || [];
                // Convert string dates back to Date objects
                this.loads.forEach(load => {
                    load.startTime = new Date(load.startTime);
                    if (load.endTime) load.endTime = new Date(load.endTime);
                    if (load.pausedAt) load.pausedAt = new Date(load.pausedAt);
                });
            } catch (error) {
                console.error('Error loading data:', error);
                this.loads = [];
            }
        }
    }

    saveData() {
        try {
            const data = {
                loads: this.loads,
                lastSaved: new Date()
            };
            localStorage.setItem('laundryTracker', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving data:', error);
            this.showNotification('Error saving data', 'error');
        }
    }

    // Event Binding
    bindEvents() {
        // Form submission
        document.getElementById('add-load-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addLoad();
        });

        // History actions
        document.getElementById('clear-history-btn').addEventListener('click', () => {
            this.clearHistory();
        });

        document.getElementById('export-data-btn').addEventListener('click', () => {
            this.exportData();
        });

        // Notify me button
        document.getElementById('notify-me-btn').addEventListener('click', () => {
            this.handleNotifyMe();
        });

        // Load actions delegation
        document.addEventListener('click', (e) => {
            const target = e.target;
            const loadItem = target.closest('.load-item');
            
            if (!loadItem) return;
            
            const loadId = loadItem.dataset.loadId;
            const load = this.loads.find(l => l.id === loadId);
            
            if (!load) return;

            if (target.classList.contains('complete-btn')) {
                this.completeLoad(loadId);
            } else if (target.classList.contains('pause-btn')) {
                this.togglePauseLoad(loadId);
            } else if (target.classList.contains('cancel-btn')) {
                this.cancelLoad(loadId);
            }
        });
    }

    // Load Management
    addLoad() {
        const form = document.getElementById('add-load-form');
        const formData = new FormData(form);
        
        const load = {
            id: this.generateId(),
            type: document.getElementById('load-type').value,
            location: document.getElementById('load-location').value,
            category: document.getElementById('load-category').value,
            duration: parseInt(document.getElementById('duration').value),
            notes: document.getElementById('load-notes').value.trim(),
            status: 'running',
            startTime: new Date(),
            endTime: null,
            pausedTime: 0,
            pausedAt: null
        };

        this.loads.unshift(load);
        this.saveData();
        this.updateDisplay();
        this.startTimer(load.id);
        
        form.reset();
        document.getElementById('duration').value = 30; // Reset to default
        
        this.showNotification(`Started ${load.type} load at ${this.getLocationName(load.location)} - ${load.category}`, 'success');
    }

    completeLoad(loadId) {
        const load = this.loads.find(l => l.id === loadId);
        if (!load) return;

        load.status = 'completed';
        load.endTime = new Date();
        
        this.stopTimer(loadId);
        this.saveData();
        this.updateDisplay();
        
        this.showNotification(`${load.type} load completed at ${this.getLocationName(load.location)}!`, 'success');
        this.showBrowserNotification('Laundry Complete!', `Your ${load.category} ${load.type} load at ${this.getLocationName(load.location)} is done.`);
    }

    togglePauseLoad(loadId) {
        const load = this.loads.find(l => l.id === loadId);
        if (!load || load.status !== 'running' && load.status !== 'paused') return;

        if (load.status === 'running') {
            load.status = 'paused';
            load.pausedAt = new Date();
            this.stopTimer(loadId);
            this.showNotification(`${load.type} load paused`, 'info');
        } else {
            load.status = 'running';
            if (load.pausedAt) {
                load.pausedTime += Date.now() - load.pausedAt.getTime();
                load.pausedAt = null;
            }
            this.startTimer(loadId);
            this.showNotification(`${load.type} load resumed`, 'info');
        }

        this.saveData();
        this.updateDisplay();
    }

    cancelLoad(loadId) {
        const load = this.loads.find(l => l.id === loadId);
        if (!load) return;

        if (confirm('Are you sure you want to cancel this load?')) {
            load.status = 'cancelled';
            load.endTime = new Date();
            
            this.stopTimer(loadId);
            this.saveData();
            this.updateDisplay();
            
            this.showNotification(`${load.type} load cancelled`, 'info');
        }
    }

    // Timer Management
    startTimer(loadId) {
        const load = this.loads.find(l => l.id === loadId);
        if (!load) return;

        const timer = setInterval(() => {
            const elapsed = this.getElapsedTime(load);
            const remaining = (load.duration * 60 * 1000) - elapsed;

            if (remaining <= 0) {
                this.completeLoad(loadId);
                return;
            }

            this.updateLoadTimer(loadId, remaining);
        }, 1000);

        this.timers.set(loadId, timer);
    }

    stopTimer(loadId) {
        const timer = this.timers.get(loadId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(loadId);
        }
    }

    startTimerUpdates() {
        // Update all active timers every second
        setInterval(() => {
            this.loads
                .filter(load => load.status === 'running')
                .forEach(load => {
                    const elapsed = this.getElapsedTime(load);
                    const remaining = (load.duration * 60 * 1000) - elapsed;
                    
                    if (remaining <= 0) {
                        this.completeLoad(load.id);
                    } else {
                        this.updateLoadTimer(load.id, remaining);
                    }
                });
        }, 1000);
    }

    getElapsedTime(load) {
        const now = Date.now();
        const startTime = load.startTime.getTime();
        let elapsed = now - startTime - load.pausedTime;

        if (load.status === 'paused' && load.pausedAt) {
            elapsed -= (now - load.pausedAt.getTime());
        }

        return Math.max(0, elapsed);
    }

    updateLoadTimer(loadId, remainingMs) {
        const loadElement = document.querySelector(`[data-load-id="${loadId}"]`);
        if (!loadElement) return;

        const timeDisplay = loadElement.querySelector('.time-remaining');
        const progressFill = loadElement.querySelector('.progress-fill');
        const load = this.loads.find(l => l.id === loadId);

        if (timeDisplay && load) {
            timeDisplay.textContent = this.formatTime(remainingMs);
            
            // Update progress bar
            if (progressFill) {
                const totalMs = load.duration * 60 * 1000;
                const progress = ((totalMs - remainingMs) / totalMs) * 100;
                progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
            }
        }
    }

    // Display Updates
    updateDisplay() {
        this.updateStats();
        this.renderActiveLoads();
        this.renderHistory();
    }

    updateStats() {
        const activeLoads = this.loads.filter(load => load.status === 'running' || load.status === 'paused');
        const todayLoads = this.loads.filter(load => this.isToday(load.startTime));
        const completedLoads = this.loads.filter(load => load.status === 'completed');
        
        // Update header stats
        document.getElementById('active-count').textContent = activeLoads.length;
        document.getElementById('today-count').textContent = todayLoads.length;
        
        // Update statistics section
        document.getElementById('total-loads').textContent = this.loads.length;
        
        // Average duration for completed loads
        if (completedLoads.length > 0) {
            const avgDuration = completedLoads.reduce((sum, load) => sum + load.duration, 0) / completedLoads.length;
            document.getElementById('avg-duration').textContent = Math.round(avgDuration) + 'm';
        } else {
            document.getElementById('avg-duration').textContent = '0m';
        }
        
        // This week's loads
        const thisWeekLoads = this.loads.filter(load => this.isThisWeek(load.startTime));
        document.getElementById('this-week').textContent = thisWeekLoads.length;
        
        // Most common category
        const categories = this.loads.map(load => load.category);
        const mostCommon = this.getMostCommon(categories);
        document.getElementById('most-common').textContent = mostCommon || '-';
    }

    renderActiveLoads() {
        const container = document.getElementById('active-loads-container');
        const emptyState = document.getElementById('no-active-loads');
        const activeLoads = this.loads.filter(load => load.status === 'running' || load.status === 'paused');
        
        if (activeLoads.length === 0) {
            emptyState.style.display = 'block';
            // Remove all load items
            container.querySelectorAll('.load-item').forEach(item => item.remove());
        } else {
            emptyState.style.display = 'none';
            this.renderLoads(container, activeLoads);
        }
    }

    renderHistory() {
        const container = document.getElementById('history-container');
        const emptyState = document.getElementById('no-history');
        const historyLoads = this.loads
            .filter(load => load.status === 'completed' || load.status === 'cancelled')
            .slice(0, 10); // Show last 10 completed loads
        
        if (historyLoads.length === 0) {
            emptyState.style.display = 'block';
            container.querySelectorAll('.load-item').forEach(item => item.remove());
        } else {
            emptyState.style.display = 'none';
            this.renderLoads(container, historyLoads);
        }
    }

    renderLoads(container, loads) {
        // Clear existing load items
        container.querySelectorAll('.load-item').forEach(item => item.remove());
        
        loads.forEach(load => {
            const loadElement = this.createLoadElement(load);
            container.appendChild(loadElement);
        });
    }

    createLoadElement(load) {
        const template = document.getElementById('load-item-template');
        const element = template.content.cloneNode(true);
        const loadItem = element.querySelector('.load-item');
        
        loadItem.dataset.loadId = load.id;
        
        // Fill in load information
        element.querySelector('.load-type').textContent = this.capitalizeFirst(load.type);
        element.querySelector('.load-category').textContent = this.capitalizeFirst(load.category);
        element.querySelector('.load-location').textContent = this.getLocationName(load.location);
        element.querySelector('.load-time').textContent = this.formatDateTime(load.startTime);
        element.querySelector('.load-duration').textContent = `${load.duration}min`;
        
        // Notes
        const notesElement = element.querySelector('.load-notes');
        if (load.notes) {
            notesElement.textContent = load.notes;
        }
        
        // Status and timer
        const statusBadge = element.querySelector('.status-badge');
        const timeRemaining = element.querySelector('.time-remaining');
        const progressFill = element.querySelector('.progress-fill');
        
        statusBadge.textContent = load.status;
        statusBadge.className = `status-badge ${load.status}`;
        
        if (load.status === 'running' || load.status === 'paused') {
            const elapsed = this.getElapsedTime(load);
            const remaining = (load.duration * 60 * 1000) - elapsed;
            
            if (remaining > 0) {
                timeRemaining.textContent = this.formatTime(remaining);
                const progress = (elapsed / (load.duration * 60 * 1000)) * 100;
                progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
            } else {
                timeRemaining.textContent = '00:00';
                progressFill.style.width = '100%';
            }
        } else {
            // Completed or cancelled loads
            if (load.endTime) {
                const actualDuration = load.endTime.getTime() - load.startTime.getTime() - load.pausedTime;
                timeRemaining.textContent = this.formatTime(actualDuration);
            }
            progressFill.style.width = '100%';
        }
        
        // Action buttons
        const actions = element.querySelector('.load-actions');
        if (load.status === 'completed' || load.status === 'cancelled') {
            actions.style.display = 'none';
        } else {
            // Update pause button text
            const pauseBtn = element.querySelector('.pause-btn');
            if (load.status === 'paused') {
                pauseBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
            }
        }
        
        return element;
    }

    // Utility Functions
    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    formatDateTime(date) {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    isThisWeek(date) {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return date >= weekAgo;
    }

    getMostCommon(arr) {
        if (arr.length === 0) return null;
        
        const frequency = {};
        arr.forEach(item => {
            frequency[item] = (frequency[item] || 0) + 1;
        });
        
        let maxCount = 0;
        let mostCommon = null;
        
        for (const [item, count] of Object.entries(frequency)) {
            if (count > maxCount) {
                maxCount = count;
                mostCommon = item;
            }
        }
        
        return this.capitalizeFirst(mostCommon);
    }

    getLocationName(locationCode) {
        const locations = {
            'ramanujan': 'Ramanujan Hostel',
            'apj': 'APJ Hostel',
            'vishveswariya': 'Vishveswariya Hostel'
        };
        return locations[locationCode] || locationCode;
    }

    // Notifications
    async requestNotificationPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            this.notificationPermission = permission === 'granted';
        }
    }

    showBrowserNotification(title, body) {
        if (this.notificationPermission && 'Notification' in window) {
            new Notification(title, {
                body: body,
                icon: '/favicon.ico', // Add your icon
                tag: 'laundry-tracker'
            });
        }
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications-container');
        const notification = document.createElement('div');
        
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle'
        };
        
        notification.innerHTML = `
            <i class="${icons[type]}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(notification);
        
        // Remove notification after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    // Data Management
    clearHistory() {
        if (confirm('Are you sure you want to clear all completed loads from history?')) {
            this.loads = this.loads.filter(load => load.status === 'running' || load.status === 'paused');
            this.saveData();
            this.updateDisplay();
            this.showNotification('History cleared', 'success');
        }
    }

    exportData() {
        const data = {
            loads: this.loads,
            exportDate: new Date(),
            version: '1.0'
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `laundry-tracker-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        this.showNotification('Data exported successfully', 'success');
    }

    handleNotifyMe() {
        const email = prompt('Enter your AIT PUNE email address to get notified when these hostel locations are available:');
        
        if (email) {
            // In a real application, this would send the email to a server
            // For now, we'll just show a success message and store locally
            const notifications = JSON.parse(localStorage.getItem('notificationRequests') || '[]');
            notifications.push({
                email: email,
                timestamp: new Date(),
                locations: ['Ramanujan Hostel', 'APJ Hostel', 'Vishveswariya Hostel']
            });
            localStorage.setItem('notificationRequests', JSON.stringify(notifications));
            
            this.showNotification(`Great! We'll notify you at ${email} when these locations are available.`, 'success');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.laundryTracker = new LaundryTracker();
});

// Service worker registration for offline capability (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(() => console.log('Service Worker registered'))
            .catch(() => console.log('Service Worker registration failed'));
    });
}
