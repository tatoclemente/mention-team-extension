# Mention my team

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VSCode](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://code.visualstudio.com/)
[![Version](https://img.shields.io/badge/version-0.1.0--beta-orange.svg)](https://marketplace.visualstudio.com/items?itemName=tatoclemente.mention-my-team)
[![Free](https://img.shields.io/badge/price-FREE-green.svg)](https://marketplace.visualstudio.com/items?itemName=tatoclemente.mention-my-team)

> ⚠️ **Beta Version** - This extension is in early development. Please report any issues on [GitHub](https://github.com/tatoclemente/mention-team-extension/issues).

Extensión para VSCode que permite mencionar miembros del equipo en comentarios de código con integración a GitHub.

## Características

- 🎯 Menciona compañeros con `@username` en comentarios
- 📝 Sintaxis compatible con Better Comments
- 🔔 Notificaciones automáticas via GitHub Issues con asignación directa
- 📧 Notificación por email automática de GitHub al usuario mencionado
- 📍 Links directos al código en GitHub con número de línea
- 📄 Contexto de código (10 líneas) incluido en la issue
- 🎨 Resaltado visual de menciones
- ⚙️ Configuración simple

## Uso

```javascript
// @teammate Este método debería retornar una clase "Locality"
//? author: @yourname fecha: 22 nov 2025
static create(props: LocalityProps): ILocality {
  return new Locality(
    props.id,
    props.name,
    props.cityId
  );
}
```

Cuando escaneas las menciones, la extensión:
1. Crea una GitHub Issue asignada al usuario mencionado
2. GitHub envía automáticamente un email de notificación
3. La issue incluye:
   - El mensaje de la mención
   - Link directo al archivo y línea en GitHub
   - Autor y fecha
   - Contexto: 10 líneas de código después del comentario author

## Configuración

### Configuración inicial

1. Configurar tu usuario de GitHub:
   ```bash
   git config --global github.user tu-usuario-github
   ```

2. Ejecutar comando: `Team Mentions: Configure`
3. Ingresar GitHub Personal Access Token
4. La extensión detectará automáticamente el repositorio desde tu configuración de git

> 💡 Solo necesitas configurar el token una vez. El repositorio se detecta automáticamente desde `git remote origin`

### Formato de menciones

La extensión busca el siguiente patrón:
```
// @username Mensaje para el usuario
//? author: @tuusuario fecha: DD MMM YYYY
[código que se incluirá como contexto - hasta 10 líneas]
```

## Comandos

- `Team Mentions: Configure` - Configurar extensión
- `Team Mentions: Scan for Mentions` - Escanear menciones en workspace

## Configuración avanzada

Puedes cambiar el método de notificación en la configuración de VSCode:
- `issue` (por defecto): Crea GitHub Issues con label `team-mention` para fácil filtrado
- `discussion` (avanzado): Crea GitHub Discussions que se pueden borrar (requiere habilitar Discussions en el repo)

## Estado Actual

✅ Funcionalidades implementadas:
- Detección de menciones con sintaxis `@username`
- Metadata con `//? author: @username fecha: DD MMM YYYY`
- Creación automática de GitHub Issues
- Asignación directa al usuario mencionado
- Label `team-mention` para filtrado fácil
- Contexto de código (10 líneas después del author)
- Links directos a GitHub con línea específica
- Notificación por email vía GitHub

## Roadmap

- [ ] Soporte para GitLab
- [ ] Integración con Cursor/Windsurf
- [ ] Notificaciones en tiempo real
- [ ] Configuración por proyecto
- [ ] Soporte para comentarios multi-línea `/* */`

## Contribuir

¡Las contribuciones son bienvenidas! Lee [CONTRIBUTING.md](CONTRIBUTING.md) para más detalles.

## Licencia

MIT © [tatoclemente](https://github.com/tatoclemente)

## Autor

Creado por [@tatoclemente](https://github.com/tatoclemente)
