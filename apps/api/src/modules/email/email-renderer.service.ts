import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Responsible only for Handlebars template loading and rendering.
 *
 * Templates live in src/modules/email/templates/*.hbs
 * Layout partial: templates/partials/layout.hbs
 *
 * To add a new template: create a .hbs file — no code changes needed.
 */
@Injectable()
export class EmailRendererService implements OnModuleInit {
  private readonly logger = new Logger(EmailRendererService.name);
  private readonly compiled = new Map<string, HandlebarsTemplateDelegate>();

  onModuleInit(): void {
    this.registerPartial('partials/layout');

    for (const name of ['email-verification', 'password-reset', 'invitation']) {
      this.compileTemplate(name);
    }

    this.logger.log('Email templates compiled');
  }

  render(templateName: string, context: Record<string, unknown>): string {
    const template = this.compiled.get(templateName);
    if (!template) {
      throw new Error(`Email template '${templateName}' not found`);
    }
    return template(context);
  }

  private compileTemplate(name: string): void {
    const filePath = this.resolveTemplatePath(`${name}.hbs`);
    const source = fs.readFileSync(filePath, 'utf-8');
    this.compiled.set(name, Handlebars.compile(source));
  }

  private registerPartial(name: string): void {
    const filePath = this.resolveTemplatePath(`${name}.hbs`);
    const source = fs.readFileSync(filePath, 'utf-8');
    Handlebars.registerPartial(name, source);
  }

  /**
   * Resolves template path for both webpack bundle and development environments.
   *
   * In webpack bundle (nest start --watch / build):
   *   __dirname = dist/  → assets are copied to dist/modules/email/templates/
   *
   * In ts-node / ts-jest (unit tests):
   *   __dirname = src/modules/email/  → templates live at src/modules/email/templates/
   */
  private resolveTemplatePath(relativePath: string): string {
    const candidates = [
      // Webpack bundle: __dirname = dist/, NestJS copies assets to dist/modules/email/templates/
      path.join(__dirname, 'modules', 'email', 'templates', relativePath),
      // ts-node / tests: __dirname = src/modules/email/
      path.join(__dirname, 'templates', relativePath),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    throw new Error(
      `Email template not found: ${relativePath}. Searched: ${candidates.join(', ')}`
    );
  }
}
