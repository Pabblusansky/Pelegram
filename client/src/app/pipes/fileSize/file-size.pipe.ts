import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'fileSize',
  standalone: true,
})
export class FileSizePipe implements PipeTransform {
  private readonly units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  transform(bytes: number | undefined | null, precision: number = 2): string {
    if (bytes === undefined || bytes === null || isNaN(bytes) || !isFinite(bytes) || bytes === 0) {
      return '0 bytes';
    }

    let num = bytes;
    let unitIndex = 0;

    while (num >= 1024 && unitIndex < this.units.length - 1) {
      num /= 1024;
      unitIndex++;
    }

    return `${num.toFixed(precision)} ${this.units[unitIndex]}`;
  }
}