import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ChatApiService } from './chat-api.service';
import { TokenService } from '../../services/token.service';

describe('ChatApiService.directChatRoute', () => {
  let service: ChatApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: TokenService, useValue: { getToken: () => 'token' } },
      ],
    });
    service = TestBed.inject(ChatApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('opens the existing chat when there is one', () => {
    let route: string[] | undefined;
    service.directChatRoute('u2').subscribe(r => route = r);

    http.expectOne(req => req.url.endsWith('/chats/direct/u2')).flush({ _id: 'c1' });

    expect(route).toEqual(['/chats', 'c1']);
  });

  it('opens a draft without creating anything when there is none', () => {
    let route: string[] | undefined;
    service.directChatRoute('u2').subscribe(r => route = r);

    http.expectOne(req => req.url.endsWith('/chats/direct/u2'))
      .flush({ message: 'No chat with this user yet' }, { status: 404, statusText: 'Not Found' });

    expect(route).toEqual(['/chats', 'new', 'u2']);
  });

  it('surfaces other failures instead of opening a draft', () => {
    let failed = false;
    service.directChatRoute('u2').subscribe({ error: () => failed = true });

    http.expectOne(req => req.url.endsWith('/chats/direct/u2'))
      .flush({}, { status: 500, statusText: 'Server Error' });

    expect(failed).toBeTrue();
  });
});
