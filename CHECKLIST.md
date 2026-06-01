# CHECKLIST - Task App (Kubernetes + CI/CD)

## 1. Uruchomienie klastra

### kind
```bash
kind create cluster --name tasks
```

### minikube
```bash
minikube start
```

### k3d
```bash
k3d cluster create tasks --api-port 6550 -p "80:80@loadbalancer"
```

Sprawdzenie:
```bash
kubectl get nodes
```

## 2. Instalacja Ingress-Nginx (wymagane dla Ingress)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Sprawdzenie:
```bash
kubectl get pods -n ingress-nginx
```

## 3. Wdrożenie aplikacji (Kustomize - środowisko prod)

```bash
kubectl apply -k k8s/prod
```

Sprawdzenie:

```bash
kubectl get pods -n tasks-app
kubectl get svc -n tasks-app
kubectl get ingress -n tasks-app
kubectl get pvc -n tasks-app
kubectl get pdb -n tasks-app
```

## 4. Dodanie hosta lokalnego

W pliku /etc/hosts dodaj:

```bash
127.0.0.1   tasks.local
```

## 5. Testy działania aplikacji

### 5.1 Healthcheck backendu

```bash
curl http://localhost:8000/health
```

Oczekiwany wynik:

```json
{"status":"ok"}
```

### 5.2 Dodanie zadania

```bash
curl -X POST http://localhost:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"moje pierwsze zadanie"}'
```

Oczekiwany wynik

```json
{"id":1,"title":"moje pierwsze zadanie"}
```

### 5.3 Pobieranie listy zadań

```bash
curl http://localhost:8080/tasks
```

Oczekiwany wynik:

```json
{"tasks":[{"id":1,"title":"moje pierwsze zadanie"}]}
```

### 6. Dowód działania workera (Redis queue)

Worker loguje każde zadanie pobrane z kolejki Redis.

```bash
kubectl logs deployment/prod-worker -n tasks-app
```

Oczekiwany log:

```
Worker got message: NEW_TASK:1:moje pierwsze zadanie
```

Backend wysłał wiadomość do Redis, worker ją odebrał i działa poprawnie.

### 7. Dowód trawłości danych (StatefulSet + PVC)

1. Dodaj zadanie:

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"zadanie trwałe"}'
```
2. Usuń pod bazy:

```bash
kubectl delete pod prod-postgres-0 -n tasks-app
```

3. Poczekaj aż pod się odtworzy:

```bash
kubectl get pods -n tasks-app
```

4. Sprawdź dane:

```bash
curl http://localhost:8080/tasks
```

### 8. Rolling update backendu

```bash
kubectl rollout status deployment/prod-backend -n tasks-app
```

Powinno pokazać:

```bash
deployment "prod-backend" successfully rolled out
```

### 9. NetworkPolicy - dowód izolacji

Wejście do losowego poda i połączenie się z bazą:

```bash
kubectl run test --rm -it --image=alpine -n tasks-app -- sh
apk add postgresql-client
psql -h postgres -U tasksuser tasksdb
```

Oczekiwany wynik:

```
psql: error: connection refused
```

Backend i worker mają dostęp, ale inne pody nie, więc izolacja działa.

### 10. PodDisruptionBudget - dowód działania

```bash
kubectl get pdb -n tasks-app
```

Powinno pokazać:

```
backend-pdb   1   1   2   Allowed disruptions: 1
```

### 11. CI/CD - ostatni udany workflow

Link do workflow:

```
https://github.com/jkaminska2/projekt-kubernetes/actions
```

Pipeline robi:
- build backend image
- build worker image
- push do GHCR
- kubectl apply -k k8s/prod
- rollout status
