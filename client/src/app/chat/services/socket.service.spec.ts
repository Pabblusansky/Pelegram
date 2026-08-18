import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SocketService } from './socket.service';

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  connected = true;
  listeners = new Map<string, Handler[]>();
  emitted: { event: string; args: unknown[] }[] = [];

  on(event: string, handler: Handler): this {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
    return this;
  }

  off(event: string, handler?: Handler): this {
    if (!handler) {
      this.listeners.delete(event);
      return this;
    }
    const list = (this.listeners.get(event) ?? []).filter(h => h !== handler);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    const ack = args[args.length - 1];
    if (event === 'send_message' && typeof ack === 'function') {
      (ack as Handler)({ success: true, message: { _id: 'm1', content: 'hi' } });
    }
    return this;
  }

  disconnect(): this {
    this.connected = false;
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }

  count(event: string): number {
    return (this.listeners.get(event) ?? []).length;
  }

  fire(event: string, payload: unknown): void {
    (this.listeners.get(event) ?? []).forEach(h => h(payload));
  }
}

describe('SocketService listener lifecycle', () => {
  let service: SocketService;
  let socket: FakeSocket;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), SocketService],
    });
    service = TestBed.inject(SocketService);
    socket = new FakeSocket();
    (service as unknown as { socket: FakeSocket }).socket = socket;
  });

  it('removes the typing listener when the subscriber unsubscribes', () => {
    const sub = service.onTyping().subscribe();
    expect(socket.count('typing')).toBe(1);

    sub.unsubscribe();
    expect(socket.count('typing')).toBe(0);
  });

  it('does not accumulate typing listeners across repeated subscribe/unsubscribe cycles', () => {
    for (let i = 0; i < 5; i++) {
      service.onTyping().subscribe().unsubscribe();
    }
    expect(socket.count('typing')).toBe(0);
  });

  it('delivers typing events to an active subscriber', () => {
    const seen: unknown[] = [];
    const sub = service.onTyping().subscribe(d => seen.push(d));

    socket.fire('typing', { chatId: 'c1', senderId: 'u1', isTyping: true });
    expect(seen.length).toBe(1);

    sub.unsubscribe();
    socket.fire('typing', { chatId: 'c1', senderId: 'u1', isTyping: false });
    expect(seen.length).toBe(1);
  });

  it('removes the message status listener when the subscriber unsubscribes', () => {
    const sub = service.onMessageStatusUpdated().subscribe();
    expect(socket.count('messageStatusUpdated')).toBe(1);

    sub.unsubscribe();
    expect(socket.count('messageStatusUpdated')).toBe(0);
  });

  it('does not register a message_edited listener for every message sent', () => {
    for (let i = 0; i < 10; i++) {
      service.sendMessage('c1', `message ${i}`).subscribe();
    }
    expect(socket.count('message_edited')).toBe(0);
  });

  it('still resolves sendMessage from the server acknowledgement', () => {
    const received: unknown[] = [];
    service.sendMessage('c1', 'hi').subscribe(m => received.push(m));

    expect(received.length).toBe(1);
    expect(socket.emitted.some(e => e.event === 'send_message')).toBe(true);
  });
});
