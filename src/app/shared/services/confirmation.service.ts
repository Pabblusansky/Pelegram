import { Injectable, ApplicationRef, createComponent, EnvironmentInjector } from '@angular/core';
import { ConfirmationDialogComponent } from '../components/confirmation-dialogue/confirmation-dialogue.component';

interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmationService {

  constructor(
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector
  ) { }

  public confirm(options: ConfirmationOptions): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const componentRef = createComponent(ConfirmationDialogComponent, {
        environmentInjector: this.injector
      });

      const instance = componentRef.instance as ConfirmationDialogComponent;
      instance.title = options.title;
      instance.message = options.message;
      if (options.confirmText) instance.confirmText = options.confirmText;
      if (options.cancelText) instance.cancelText = options.cancelText;

      const subConfirmed = (componentRef.instance as ConfirmationDialogComponent).confirmed.subscribe(() => {
        cleanup();
        resolve(true);
      });
      const subCancelled = (componentRef.instance as ConfirmationDialogComponent).cancelled.subscribe(() => {
        cleanup();
        resolve(false);
      });

      this.appRef.attachView(componentRef.hostView);
      const domElem = (componentRef.hostView as any).rootNodes[0] as HTMLElement;
      document.body.appendChild(domElem);

      const cleanup = () => {
        subConfirmed.unsubscribe();
        subCancelled.unsubscribe();
        this.appRef.detachView(componentRef.hostView);
        componentRef.destroy();
      };
    });
  }
}