# Sistema de Controle e Monitoramento de Tablets Escolares

Este sistema completo permite que uma escola gerencie e monitore tablets em tempo real em uma rede local. O sistema é dividido em três partes:
1. **Servidor Backend (API & WebSockets)**: Executa no computador servidor da escola.
2. **Dashboard Web (Frontend React)**: Interface moderna e bonita para os administradores.
3. **Aplicativo Android Nativo (Kotlin)**: Aplicativo que bloqueia o tablet até o login do estudante e envia status em tempo real.

---

## 🚀 Como Configurar o Servidor Local da Escola

### 1. Definir IP Fixo no Computador Servidor
Para que os tablets não percam a conexão se o roteador reiniciar, defina um IP estático/fixo no computador que rodará o servidor:
1. Pressione `Win + R`, digite `ncpa.cpl` e pressione Enter.
2. Clique com o botão direito na sua placa de rede ativa (Wi-Fi ou Ethernet) e selecione **Propriedades**.
3. Dê dois cliques em **Protocolo IP Versão 4 (TCP/IPv4)**.
4. Selecione **"Usar o seguinte endereço IP"**.
5. Preencha as informações da sua sub-rede, por exemplo:
   - **Endereço IP**: `192.168.0.100` (ou qualquer IP livre da sua rede local)
   - **Máscara de sub-rede**: `255.255.255.0`
   - **Gateway padrão**: `192.168.0.1` (IP do seu roteador)
6. Defina os servidores DNS (ex: Google: `8.8.8.8` e `8.8.4.4`).
7. Clique em OK para salvar.

### 2. Liberar a Porta no Firewall do Windows
O servidor utiliza a porta **3000** por padrão. Para liberá-la automaticamente, clique com o botão direito no script `setup.bat` e escolha **Executar como Administrador**. 

Isso criará a regra no Firewall do Windows e instalará todas as dependências (`npm install`) para o servidor e o dashboard.

---

## 💻 Como Iniciar o Servidor e o Dashboard

### Iniciar o Servidor Backend (Porta 3000)
1. Abra um terminal de comandos.
2. Navegue até a pasta do servidor:
   ```powershell
   cd server
   npm start
   ```
3. O servidor estará rodando em `http://localhost:3000` (e disponível na rede local em `http://192.168.0.100:3000`).

### Iniciar o Dashboard Administrativo
1. Abra um novo terminal de comandos.
2. Navegue até a pasta do dashboard:
   ```powershell
   cd dashboard
   npm run dev
   ```
3. Abra `http://localhost:5173` no navegador do computador.
4. **Credenciais padrão de administrador**:
   - **Usuário**: `admin`
   - **Senha**: `admin123`

---

## 📱 Como Configurar e Instalar o App nos Tablets

1. Abra o projeto localizado na pasta `android-app` usando o **Android Studio**.
2. Conecte o tablet ao computador via cabo USB e certifique-se de que a **Depuração USB** está ativa nas opções do desenvolvedor do tablet.
3. Para instalar e executar o app diretamente, clique no botão **Run** no Android Studio.
4. **Conexão com o Servidor**:
   - Na tela inicial do app no tablet, insira o endereço IP local configurado no servidor (exemplo: `http://192.168.0.100:3000`).
   - Clique em **Testar Conexão**. O status mudará para verde e a tela de login institucional será exibida.
5. **Autenticação de Estudante**:
   - Foram semeados estudantes padrão para testes: matrícula `2026001` (Ana Silva), `2026002`, `2026003`, etc.
   - Digite a matrícula para liberar o uso do tablet.

---

## 🔒 Limpeza de Dados do Estudante após o Logout

Ao realizar o logout no tablet (ou por comando remoto no painel administrativo), o aplicativo executará as seguintes ações:
- Destruição e revogação do token da sessão do estudante.
- Limpeza total do cache e cookies do navegador interno (`WebView`).
- **Limitação técnica do Android**: O ecossistema Android isola cada aplicativo por razões de segurança. Portanto, um aplicativo comum não pode apagar o cache de aplicativos externos de terceiros (como Microsoft Teams, Google Chrome nativo, etc). Para limpar totalmente esses aplicativos de terceiros ao trocar de estudante, recomenda-se configurar o tablet usando **Android Enterprise** com um perfil de convidado efêmero (Guest Profile), ou reiniciar o perfil de trabalho através de uma ferramenta MDM corporativa.
