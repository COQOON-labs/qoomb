# Encryption Module

Pluggable encryption system with automatic field encryption via decorators.

## 🚀 Quick Start

### 1. Setup (One-time)

```bash
# Generate encryption key
openssl rand -base64 32

# Add to .env
KEY_PROVIDER=environment
ENCRYPTION_KEY=<generated-key>
```

### 2. Import Module

```typescript
// app.module.ts
import { EncryptionModule } from './modules/encryption';

@Module({
  imports: [
    EncryptionModule, // ← Add this
    // ... other modules
  ],
})
export class AppModule {}
```

### 3. Use Decorators

```typescript
import { Injectable } from '@nestjs/common';
import { EncryptFields, DecryptFields } from './modules/encryption';

@Injectable()
export class EventsService {
  // ✅ Automatic encryption on return
  @EncryptFields(['title', 'description'])
  async createEvent(data: CreateEventInput, hiveId: string) {
    return this.prisma.event.create({ data });
    // title and description are encrypted automatically!
  }

  // ✅ Automatic decryption on return
  @DecryptFields(['title', 'description'])
  async getEvent(id: string, hiveId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    return event;
    // title and description are decrypted automatically!
  }
}
```

**That's it!** 🎉 No manual encryption code needed.

---

## 📚 Available Decorators

### @EncryptFields

Encrypts specified fields in the return value.

```typescript
@EncryptFields(['field1', 'field2'])
async method(data: any, hiveId: string) { }

// Or with options:
@EncryptFields({
  fields: ['field1', 'field2'],
  hiveIdParam: 'organizationId' // Default: 'hiveId'
})
```

### @DecryptFields

Decrypts specified fields in the return value.

```typescript
@DecryptFields(['field1', 'field2'])
async method(id: string, hiveId: string) { }
```

### @EncryptDecryptFields

Both encrypts and decrypts (for update operations).

```typescript
@EncryptDecryptFields(['field1', 'field2'])
async method(data: any, hiveId: string) { }
```

---

## 🔧 Key Providers

### Environment (Default, Recommended)

```bash
KEY_PROVIDER=environment
ENCRYPTION_KEY=$(openssl rand -base64 32)
```

**Best for:** Development, Docker, most production deployments

### File (Advanced)

```bash
KEY_PROVIDER=file
KEY_FILE_PATH=/secrets/master-key.enc
KEY_FILE_PASSWORD=strong-password-here
```

**Best for:** Self-hosted with additional security layer

### AWS KMS (Enterprise)

```bash
KEY_PROVIDER=aws-kms
AWS_KMS_KEY_ID=arn:aws:kms:...
AWS_REGION=eu-central-1
```

**Best for:** Enterprise with AWS, compliance requirements

### HashiCorp Vault (Enterprise Self-Hosted)

```bash
KEY_PROVIDER=vault
VAULT_ADDR=https://vault.company.com
VAULT_TOKEN=<token>
```

**Best for:** Enterprise self-hosted, multi-service secrets

---

## 🏗️ Architecture

```
Master Key (from KEY_PROVIDER)
    ↓ HKDF
Hive-Specific Key (one per hive)
    ↓ AES-256-GCM
Encrypted Data
```

**Security Features:**

- ✅ Per-hive key isolation
- ✅ Authenticated encryption (AES-256-GCM)
- ✅ Key versioning (rotation support)
- ✅ Startup self-test
- ✅ No default provider (explicit config required)

---

## 📊 Performance

**Overhead per field:**

- Encryption: ~0.1ms
- Decryption: ~0.1ms
- HKDF derivation: Cached (negligible)

**Best Practices:**

- ✅ Only encrypt sensitive fields
- ✅ Use pagination for large lists
- ✅ Consider search requirements (encrypted = not searchable)

**Example:**

```typescript
// ❌ Don't encrypt everything
@EncryptFields(['title', 'description', 'location', 'notes', 'metadata'])

// ✅ Only encrypt sensitive data
@EncryptFields(['notes']) // Only notes are sensitive
```

---

## 🔍 Search Considerations

**Encrypted fields cannot be searched on the server.**

### Solution 1: Selective Encryption

```typescript
// Title is plaintext (searchable)
// Description is encrypted (private)
@EncryptFields(['description'])
async createEvent(data: any, hiveId: string) { }
```

### Solution 2: Search Tokens

```typescript
// Store searchable hash alongside encrypted data
const searchToken = crypto.createHash('sha256').update(data.title.toLowerCase()).digest('hex');

// Query: WHERE search_token = hash(searchTerm)
```

### Solution 3: Client-Side Search

```typescript
// Load encrypted data, decrypt on client, search locally
// Good for small datasets (<1000 items)
```

---

## 🔄 Key Rotation

When rotating keys, old data remains encrypted with old key.

**Strategy:**

1. Keep old key version accessible
2. New data uses new key
3. Gradual re-encryption (optional)

```typescript
// EncryptedData includes version number
{
  version: 1,  // Key version used
  provider: 'environment',
  data: Buffer
}

// Decryption uses correct version automatically
```

---

## 🧪 Testing

```typescript
// Test encryption
describe('EventsService', () => {
  it('should encrypt sensitive fields', async () => {
    const event = await service.createEvent(
      {
        title: 'Secret Meeting',
        description: 'Top secret',
      },
      hiveId
    );

    // Check that fields are encrypted (base64 strings)
    expect(event.title).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(event.title).not.toBe('Secret Meeting');
  });

  it('should decrypt on read', async () => {
    const event = await service.getEvent(eventId, hiveId);

    // Check that fields are decrypted
    expect(event.title).toBe('Secret Meeting');
  });
});
```

---

## 🐛 Troubleshooting

### "KEY_PROVIDER not configured"

→ Set `KEY_PROVIDER` in `.env` (no default for security)

### "ENCRYPTION_KEY not set"

→ Generate: `openssl rand -base64 32`

### "Encryption self-test failed"

→ Check `KEY_PROVIDER` and key validity

### "hiveId parameter not found"

→ Ensure method has `hiveId: string` parameter

### "Decryption failed"

→ Data encrypted with different key/hive

---

## 📖 Examples

See [`examples/events.example.service.ts`](./examples/events.example.service.ts) for complete examples.

---

## 🔒 Security

- Master key never in code or database
- Per-hive isolation (compromise of one ≠ all)
- Authenticated encryption (prevents tampering)
- Explicit configuration (no hidden defaults)
- Startup validation (fails early)

For detailed security documentation, see [`docs/SECURITY.md`](../../../../docs/SECURITY.md).
