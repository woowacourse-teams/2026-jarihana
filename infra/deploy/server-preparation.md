# SSM으로 배포 리허설 서버 준비하기

목표는 별도 Nginx EC2와 앱 B EC2에 컨테이너 실행 환경을 준비하고, 사설 IP로 요청이 전달되는지 확인하는 것이다.
이 준비가 끝나도 Spring Boot 배포·worker 인계·롤백 자동화가 완료된 것은 아니다.
설계는 [인프라 ADR 0005](../docs/adr/0005-nginx-ec2-blue-green-deployment.md),
배포 제어 코드는 [구현 안내](README.md)를 따른다.

## 대상과 접속

- 기존 dev를 A로 사용하고, 새 앱 B와 별도 Nginx에서 먼저 리허설한다. 앱 B의 이름이 prod2여도 시험 중에는 비운영 설정을 사용한다.
- SSM으로 접속한 페이지의 instance ID와 명령으로 확인한 호스트명을 대조한다. 인스턴스 이름만 보고 작업하지 않는다.
- SSM Agent 온라인·IAM 인증·아웃바운드 연결이 필요하다. SSM 접속을 위해 SSH 22번을 추가 개방하지 않는다.
- 로컬 AWS CLI의 인증 오류는 브라우저 SSM 접속 실패와 별개다. 사용자의 로그인된 콘솔로 접속할 수 있으면 그 세션에서 작업한다.
- 기존 prod·DB·CloudFront·공유 IAM 정책은 준비 단계의 변경 대상이 아니다.

접속 후 다음을 확인한다.

```sh
hostname
cat /etc/os-release
uname -m
free -h
df -h /
cloud-init status
command -v docker
ip -4 -brief address
```

## 컨테이너 실행 환경

빈 리허설 서버에서 OS·아키텍처와 패키지 충돌 여부를 확인한 뒤
[Docker 공식 Ubuntu 설치 절차](https://docs.docker.com/engine/install/ubuntu/)를 사용한다.
다른 서버의 Ubuntu codename이나 패키지 버전을 그대로 복사하지 않는다.

- 기본 도구: ca-certificates, curl, git, jq, unzip.
- Docker 공식 서명 apt 저장소를 추가하고 Engine·CLI·containerd·Compose plugin을 설치한다.
- 두 서버에 같은 검증 버전을 사용하고 설치 버전과 로그를 남긴다. OS 전체 업그레이드나 재부팅은 별도 작업이다.
- Docker 자동 시작을 설정한다. 아직 앱 컨테이너나 runner의 자동 시작 정책을 설정했다는 뜻은 아니다.
- 신규 서버의 `/etc/docker/daemon.json`에 다음 기본 로그 제한을 적용한다. 기존 설정이 있으면 덮어쓰지 않고 먼저 확인한다.

```json
{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"5"}}
```

```sh
sudo docker version
sudo docker compose version
sudo docker run --rm hello-world
sudo docker info --format 'server={{.ServerVersion}} logging={{.LoggingDriver}}'
systemctl is-enabled docker
```

Docker 그룹에 사용자를 추가하는 것은 root에 준하는 권한을 주는 일이다.
준비 단계에서는 sudo로 실행하고, runner 사용자와 Docker 접근 권한은 후속 설치에서 정한다.

## 사설 통신 smoke test

```text
Nginx EC2의 curl
  → 127.0.0.1:18080의 임시 Nginx
  → 앱 B의 사설 IP:18080
  → DB·외부 푸시를 사용하지 않는 고정 테스트 응답
```

1. 보안 그룹과 서브넷을 조회해 사설 통신 경로를 확인한다. 공유 보안 그룹을 변경하면 기존 prod에도 영향을 줄 수 있다.
2. 공식 Nginx 이미지를 pull하고 digest를 기록한다. 실행할 때는 기록한 digest를 사용한다.
3. 앱 B에는 임시 응답 컨테이너를 띄운다. 별도 시험 포트를 사용하며 해당 포트가 인터넷 전체에 열려 있지 않은지 확인한다.
4. Nginx EC2에서 앱 B의 사설 IP로 직접 요청해 응답을 확인한다.
5. Nginx EC2의 임시 proxy는 호스트 loopback에만 바인딩하고, upstream을 앱 B의 사설 IP로 지정한다.
6. `nginx -t`와 실제 경유 요청으로 설정과 응답을 확인한다. 컨테이너 생성 완료와 HTTP 준비 완료를 구분한다.
7. 준비 완료 후 연속 GET 요청에서 HTTP 성공과 예상 응답 본문을 모두 확인한다.
8. 이번에 만든 컨테이너 ID와 설정 파일만 정리한다. 이미지 캐시와 설치한 도구는 유지한다.

기동 직후 연결 거부/reset은 준비 대기에 반영한다. 준비 완료 전 트래픽을 보내지 않으며,
읽기 전용 시험 GET의 재시도 방식을 사용자 쓰기 요청에 그대로 적용하지 않는다.
임시 컨테이너 삭제는 fixture 정리이며 실제 앱의 drain·SIGTERM 종료 증거 계약을 대체하지 않는다.

## 2026-10-23 KST 준비 결과

| 확인 항목 | 결과 |
| --- | --- |
| 접속 | 두 신규 EC2에 브라우저 SSM 접속 성공 |
| OS·아키텍처 | Ubuntu 26.04.1 LTS, ARM64 |
| Docker Engine·CLI | 29.9.2 |
| containerd | 2.4.2 |
| Compose plugin | 5.6.1 |
| 컨테이너 실행 | 양쪽 hello-world 성공 |
| Nginx | 1.30.5-alpine, 동일한 digest 사용 |
| 사설 경유 요청 | 준비 완료 후 50회 모두 HTTP 성공·예상 본문 일치 |
| 정리 | 임시 응답/proxy 컨테이너와 설정 삭제, 실행 환경·이미지 캐시 유지 |

이는 사설 통신과 기본 실행 환경의 검증이다. 실제 Spring Boot·RDS·로그인·worker 인계·15분 관찰·롤백·EC2 시작/중지·GitHub 자동화는 아직 검증하지 않았다.
시험 중 Nginx 컨테이너는 약 10 MiB를 사용했으나 OS·Docker까지 포함한 메모리는 별도다.
runner·수집기·배포 제어를 추가한 뒤 t4g.micro의 실제 메모리와 CPU credit을 다시 측정해야 한다.
구체적인 instance ID·주소·실행 기록은 비밀값 없이 로컬 구현맵과 검증 기록에 보관한다.

다음은 비운영 DB·푸시 수신처·이미지와 worker 기본 대기 설정을 준비해 실제 Spring Boot로 리허설하는 작업이다.
기존 dev의 동시 배포·스케줄러와 충돌하지 않게 구성하고, prod 적용 뒤에는 dev의 임시 배포 구성을 정리한다.
