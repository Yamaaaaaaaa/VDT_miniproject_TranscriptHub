import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, catchError, throwError } from 'rxjs';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Injectable()
export class UsersService {
    constructor(
        @Inject('USERS_CLIENT') private readonly usersClient: ClientProxy,
        @Inject('IDENTITY_CLIENT') private readonly identityClient: ClientProxy,
    ) { }

    findAll(): Observable<any> {
        // Send message pattern 'find_all_profiles' đến users service qua mạng TCP
        return this.usersClient
            .send('find_all_profiles', {})
            .pipe(catchError((err) => throwError(() => err)));
    }

    findOne(id: number): Observable<any> {
        return this.usersClient
            .send('find_one_profile', id)
            .pipe(catchError((err) => throwError(() => err)));
    }

    create(createUserProfileDto: CreateUserProfileDto): Observable<any> {
        return this.usersClient
            .send('create_user_profile', createUserProfileDto)
            .pipe(catchError((err) => throwError(() => err)));
    }

    update(id: number, updateUserProfileDto: UpdateUserProfileDto): Observable<any> {
        return this.usersClient
            .send('update_user_profile', { id, updateUserProfileDto })
            .pipe(catchError((err) => throwError(() => err)));
    }

    remove(id: number, requesterId?: number): Observable<any> {
        return this.identityClient
            .send('delete_account', { id, requesterId })
            .pipe(catchError((err) => throwError(() => err)));
    }
}