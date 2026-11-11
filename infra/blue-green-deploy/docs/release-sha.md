# 배포 실행 SHA 사용과 최초 전환

운영 배포는 main push 또는 main의 수동 실행이 시작된 커밋 SHA 하나를 사용한다.
앱 실행기, coordinator, queue guardian, Nginx 템플릿과 앱 Compose가 모두 같은 원본이다.
다음 main 머지 때는 새 실행의 SHA를 자동으로 사용한다. 실행 도중 추가 머지가 들어와도
이미 시작한 배포의 버전은 바뀌지 않는다. 제어태그나 자동 태그 교체 기능은 사용하지 않는다.

## 서버에 남는 설정

서버 설정은 저장소 신원, 환경, EC2/host ID, upstream, 포트, 보호된 경로와 관찰 기준을 가진다.
배포 버전은 GitHub run과 저널의 `sha`로 확인한다. 새 코드 SHA를 서버 설정에 넣는 작업은 없다.
완료된 저널에서 다음 SHA로 진행할 수 있지만, 미완료 배포와 달라진 호스트 topology는 차단한다.

watchdog과 중앙 수집기는 Actions와 독립된 설치형 도구다. watchdog은 저널 만료를 감지해
`NEEDS_ATTENTION`을 기록하며 컨테이너를 만들거나 Compose를 읽지 않는다. 이 도구의 설치본은
관리자가 갱신하지만, 일반 배포 때마다 같은 SHA로 맞출 필요는 없다.

## 기존 운영 환경의 최초 전환

이 PR은 실제 서버를 수정하지 않는다. 기존 환경이 종전 설정을 사용 중이라면 코드 병합만으로
전환이 완료된 것으로 판단하지 않는다. 아래 작업은 운영 담당자의 별도 유지보수 범위다.

1. 새 배포를 동결하고 진행 중인 Actions와 watchdog 작업이 없는 상태에서 보호 설정,
   원본 저널, 앱 intent와 S3 pointer/manifest를 보존한다. 실제 HTTP 경로와 worker owner를 대조한다.
2. [서버 구성](server-setup/README.md)의 예시에 맞춰 coordinator/A/B 설정에서
   `topology.control`과 `control_transition`을 제거한다. `BLUE_GREEN_CONTROL_REF`는 더 이상
   읽지 않으므로 GitHub 변수에서도 정리한다. 주소와 권한, 토큰은 유지한다.
3. watchdog과 중앙 수집기를 이 방식의 코드로 설치한다. 예전 watchdog drop-in을 새 설치 경로로
   교체하고 실제 `ExecStart`를 확인한다. 이전 실행 파일이 계속 호출되지 않도록 한다.
4. 기존 저널의 topology digest에는 제거한 필드가 포함돼 있으므로 새 설정과 그대로 일치하지 않는다.
   원본을 보존하고, 완료 상태와 실제 서비스가 일치하는지 확인한 운영 담당자가
   [수동 조사](recovery.md#수동-조사)에 따라 상태 이관안을 검토한다. 이 PR은 자동 이관을 하지 않는다.
   진행 중인 저널의 hash만 바꾸거나 저널을 삭제해 새 배포를 강행하지 않는다.
5. 준비가 끝나면 새 main 실행으로 배포하고, checkout/prepare SHA, 실제 후보 설정,
   HTTP/worker 관찰과 최종 완료를 확인한다. 실패한 실행을 재실행하지 않는다.

이후 Compose나 배포 스크립트를 변경하는 일반 배포에는 위 유지보수를 반복하지 않는다.
호스트 교체나 상태 형식 변경은 별도 운영 변경이며, 소스 SHA가 달라지는 것과 구분한다.

## 롤백

배포 확정 전 자동 롤백은 남아 있는 이전 컨테이너로 HTTP와 worker를 돌린다.
이전 Compose를 새 설정과 섞거나 컨테이너를 재생성하지 않는다.
컨테이너가 없어 재구성해야 하는 경우에는 해당 앱을 만든 배포 SHA의 Compose와 당시 이미지
digest를 사용하며 [장애 복구](recovery.md)를 따른다.
