# MD-Room

마크다운 파일을 보기 좋게 열고 바로 수정할 수 있는 Windows 데스크톱 앱입니다.

## 실행

```powershell
npm install
npm start
```

마크다운 파일을 직접 열어 테스트하려면:

```powershell
npm start -- "D:\path\to\file.md"
```

## 배포 파일 만들기

```powershell
npm run dist
```

생성된 설치 파일은 `dist` 폴더에 저장됩니다. 설치하면 `.md`, `.markdown`, `.mdown`, `.mkd` 파일을 이 앱으로 연결할 수 있습니다.

설치 파일 대신 `win-unpacked` 실행 파일을 직접 연결하려면:

```powershell
npm run build
.\scripts\register-md-association.ps1
```

## 기능

- `.md` 파일 더블클릭 실행 지원
- 편집, 분할, 보기 모드
- 표, 체크리스트, 코드 하이라이트, 로컬 이미지 미리보기
- 열기, 저장, 다른 이름 저장
- 기본, 비비드, 보라, 흑백, 백흑 테마
- 인쇄 지원
