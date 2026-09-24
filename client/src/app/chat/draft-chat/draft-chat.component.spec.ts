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
  let socket: jasmine.SpyObj<SocketService>;
  let toast: jasmine.SpyObj<ToastService>;
  let router: Router;

  beforeEach(async () => {
    socket = jasmine.createSpyObj<SocketService>('SocketService', ['sendFirstMessage']);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['showToast']);

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

  it('sends the first message and moves to the chat the server created', () => {
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    socket.sendFirstMessage.and.returnValue(of({ chatId: 'c1', message: {} as Message }));

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
    const navigate = spyOn(router, 'navigate');
    socket.sendFirstMessage.and.returnValue(throwError(() => 'boom'));

    component.onSend({ content: 'hello' });

    expect(navigate).not.toHaveBeenCalled();
    expect(component.isSending).toBeFalse();
    expect(toast.showToast).toHaveBeenCalled();
  });
});
