import type { Mock } from 'vitest';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { DraftChatComponent } from './draft-chat.component';
import { SocketService } from '../services/socket.service';
import { ProfileService } from '../../profile/profile.service';
import { ToastService } from '../../utils/toast-service';
import { Message } from '../chat.model';

describe('DraftChatComponent', () => {
  let component: DraftChatComponent;
  let fixture: ComponentFixture<DraftChatComponent>;
  let socket: {
    sendFirstMessage: Mock<SocketService['sendFirstMessage']>;
    getUserStatusText: Mock<SocketService['getUserStatusText']>;
    isUserOnline: Mock<SocketService['isUserOnline']>;
  };
  let toast: { showToast: Mock<ToastService['showToast']> };
  let router: Router;

  beforeEach(async () => {
    socket = { sendFirstMessage: vi.fn(), getUserStatusText: vi.fn(), isUserOnline: vi.fn() };
    socket.getUserStatusText.mockReturnValue(of('last seen 5 minutes ago'));
    socket.isUserOnline.mockReturnValue(of(false));
    toast = { showToast: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [DraftChatComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SocketService, useValue: socket },
        { provide: ToastService, useValue: toast },
        { provide: ProfileService, useValue: { getUserProfile: () => of({ _id: 'u2', username: 'bob', avatar: null }) } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(DraftChatComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('recipientId', 'u2');
    fixture.detectChanges();
  });

  it('shows the recipient it will start a chat with', () => {
    expect(component.recipientName).toBe('bob');
  });

  it('shows the recipient\'s presence like the chat header does', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(socket.getUserStatusText).toHaveBeenCalledWith('u2');
    expect(el.querySelector('.draft-status')?.textContent?.trim()).toBe('last seen 5 minutes ago');
    expect(el.querySelector('.online-indicator')).toBeNull();
  });

  it('marks an online recipient with the presence dot', () => {
    socket.isUserOnline.mockReturnValue(of(true));
    socket.getUserStatusText.mockReturnValue(of('online'));
    fixture.componentRef.setInput('recipientId', 'u3');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.online-indicator')).not.toBeNull();
    expect(el.querySelector('.draft-status')?.textContent?.trim()).toBe('online');
  });

  it('sends the first message and moves to the chat the server created', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    socket.sendFirstMessage.mockReturnValue(of({ chatId: 'c1', message: {} as Message }));

    component.onSend({ content: '  hello  ' });

    expect(socket.sendFirstMessage).toHaveBeenCalledWith('u2', 'hello');
    expect(navigate).toHaveBeenCalledWith(['/chats', 'c1'], { replaceUrl: true });
  });

  it('does not upload a file before the chat exists', () => {
    component.onSend({ content: '', file: new File(['x'], 'x.txt') });

    expect(socket.sendFirstMessage).not.toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalled();
  });

  it('stays on the draft and reports a failed send', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    socket.sendFirstMessage.mockReturnValue(throwError(() => 'boom'));

    component.onSend({ content: 'hello' });

    expect(navigate).not.toHaveBeenCalled();
    expect(component.isSending).toBe(false);
    expect(toast.showToast).toHaveBeenCalled();
  });
});
